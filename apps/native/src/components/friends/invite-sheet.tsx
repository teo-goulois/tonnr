import { XIcon } from "@repo/ui/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { RankBadge } from "@/components/account/rank-badge";
import { UsernameForm } from "@/components/account/username-form";
import { Button, IconButton } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { inviteRefusalOf, isBlockedRefusal } from "./friend-words";
import { useFriendsChanged } from "./use-friends";

// What whoever opens someone's link reads, over the map: whose it is, and what it makes, as the
// web's `InviteDialog` says it (decision 041), in a card at the middle of the screen over a veil,
// as the web draws its dialog on a phone too. A visitor is asked for an account, which is then
// made through the link and has its owner as its sponsor; an account becomes a friend at its own
// word, and opening the link alone makes nothing. The link comes as `?invite=<token>` on the map,
// which `/i/<token>` opens (decision 073).

const REFUSALS = {
  own: m.invite_own,
  blocked: m.invite_blocked,
  ended: m.invite_ended,
  gone: m.invite_gone,
  failed: m.invite_failed,
};

/** The web's dialog: 26 rem wide at most, and a rem's two widths from the screen's sides. */
const CARD_WIDTH = 416;
const CARD_MARGIN = 16;

// How long the card takes to fade out, after which whatever waited on it goes on: iOS says when
// it is gone, and this is there in case it does not.
const LEAVING_MS = Platform.OS === "ios" ? 600 : 300;

/**
 * Someone's link, as the map's address names it, `?invite=`: whose it is, said over the map while
 * the address names one. The map tab draws it.
 */
export function Invitation() {
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  if (typeof invite !== "string" || invite.length === 0) return null;
  return (
    <InviteCard
      key={invite}
      token={invite}
      onDone={() => router.setParams({ invite: undefined })}
    />
  );
}

/**
 * The card a dialog is drawn in, over the screen's veil, which a press outside it, the Android
 * back and its X close. It fades in and out, and says once when it is gone.
 */
function DialogCard({
  visible,
  onClose,
  onDismissed,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onDismissed: () => void;
  children: ReactNode;
}) {
  const { colors, space, radius } = useTheme();
  const { width } = useWindowDimensions();

  // Once it was shown and is hidden again, it says it is gone, once.
  const gone = useRef(true);
  const finish = () => {
    if (gone.current) return;
    gone.current = true;
    onDismissed();
  };
  useEffect(() => {
    if (visible) {
      gone.current = false;
      return;
    }
    if (gone.current) return;
    const timer = setTimeout(finish, LEAVING_MS);
    return () => clearTimeout(timer);
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={finish}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* A window of its own is a root of its own, for the gestures and on Android's window. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={m.action_close()}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors["neutral-10-transparent"] }]}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: Math.min(CARD_WIDTH, width - 2 * CARD_MARGIN),
              maxHeight: "85%",
              borderRadius: radius.m,
              borderCurve: "continuous",
              backgroundColor: colors["neutral-1"],
              ...edge(colors["neutral-4-transparent"]),
            }}
          >
            <ScrollView
              // As tall as what it holds, and scrolled once the card reaches its height.
              style={{ flexGrow: 0, flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: space.l, gap: space.m }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The invitation of a link, for the map tab to show while its address names one. `onDone` takes
 * the link out of the address once it made what it makes, or was left. The card steps aside
 * while the person signs in or signs up, and comes back once they do.
 */
function InviteCard({ token, onDone }: { token: string; onDone: () => void }) {
  const { space } = useTheme();
  const tell = useTell();
  const { signedIn, userId, username } = useAccount();
  const changed = useFriendsChanged();
  const focused = useIsFocused();
  // A username chosen here, before the session the sign-in library holds is read again.
  const [isNamed, setIsNamed] = useState(false);

  // Shown until it is done with; hidden a while to let another screen come, and back after.
  const [open, setOpen] = useState(true);
  const [stepping, setStepping] = useState(false);
  const next = useRef<(() => void) | null>(null);
  // Once it closes for good, nothing more is told: a friendship just made is not told twice.
  const closing = useRef(false);
  useEffect(() => {
    if (!focused) setStepping(false);
  }, [focused]);
  const visible = open && focused && !stepping;

  const close = () => {
    closing.current = true;
    next.current = onDone;
    setOpen(false);
  };
  // Steps aside, then goes where the person asked: a sheet over the map, or another tab.
  const stepAside = (go: () => void) => {
    next.current = go;
    setStepping(true);
  };

  // Whose link it is, said to anyone, a visitor too: the reader's blocks are read with it.
  const inviter = useQuery(
    orpc.v1.friends.open.queryOptions({
      input: { token },
      queryKey: [...orpc.v1.friends.open.queryKey({ input: { token } }), userId],
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
  // Whoever opens a link is told at once when its owner is a friend already.
  const friends = useQuery(
    orpc.v1.friends.list.queryOptions({
      queryKey: [...orpc.v1.friends.list.queryKey(), userId],
      enabled: signedIn,
      select: (answer) => answer.friends,
    }),
  );
  const accept = useMutation(
    orpc.v1.friends.accept.mutationOptions({
      onSuccess: (friend) => {
        tell({ title: m.invite_accepted({ username: friend.username ?? "" }), tone: "success" });
        close();
        return changed();
      },
      onError: (error) => {
        const refusal = inviteRefusalOf(error);
        tell({ title: REFUSALS[refusal](), tone: "danger" });
        // A link that makes nothing is left: asking again would say the same.
        if (refusal !== "failed") close();
      },
    }),
  );

  const found = inviter.data;
  const isBlocked = isBlockedRefusal(inviter.error);
  const isGone = inviter.isError && !isBlocked;
  const isOwn = found !== undefined && username !== null && found.username === username;
  // An account that was just made through the link is its owner's friend already: it is told
  // so, and asked nothing more.
  const isFriend =
    signedIn && found !== undefined
      ? (friends.data?.some((friend) => friend.username === found.username) ?? false)
      : false;
  useEffect(() => {
    if (!isFriend || !found || closing.current) return;
    closing.current = true;
    tell({ title: m.invite_accepted({ username: found.username }), tone: "success" });
    next.current = onDone;
    setOpen(false);
  }, [isFriend, found, tell, onDone]);

  const row = { flexDirection: "row", flexWrap: "wrap", gap: space.xs } as const;

  return (
    <DialogCard
      visible={visible}
      onClose={close}
      onDismissed={() => {
        const go = next.current;
        next.current = null;
        go?.();
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.s }}>
        <View style={{ flex: 1, gap: space.xs }}>
          {found ? (
            <View style={{ ...row, alignItems: "center" }}>
              <Text size="l" weight="medium" accessibilityRole="header" style={{ flexShrink: 1 }}>
                {m.invite_title({ username: found.username })}
              </Text>
              {found.rank ? <RankBadge rank={found.rank} /> : null}
            </View>
          ) : isBlocked || isGone ? (
            <Text size="l" weight="medium" accessibilityRole="header">
              {isBlocked ? m.invite_blocked() : m.invite_gone()}
            </Text>
          ) : (
            <Loading>
              <Skeleton width={160} height={24} />
            </Loading>
          )}
          {isBlocked ? <Text tone="muted">{m.invite_blocked_text()}</Text> : null}
          {found ? (
            <Text tone="muted">
              {isOwn ? m.invite_own() : signedIn ? m.invite_text_signed_in() : m.invite_text()}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon={XIcon}
          label={m.action_close()}
          variant="ghost"
          onPress={close}
          style={{ marginTop: -space.xs, marginEnd: -space.xs }}
        />
      </View>

      {found && !isOwn ? (
        signedIn ? (
          username === null && !isNamed ? (
            // A friend is read by a name: an account that has none chooses it here, as the web's
            // invitation asks for it, and becomes a friend after.
            <View style={{ gap: space.xs }}>
              <Text size="s">{m.invite_username_first()}</Text>
              <UsernameForm current={null} onSaved={() => setIsNamed(true)} />
            </View>
          ) : (
            <View style={row}>
              <Button loading={accept.isPending} onPress={() => accept.mutate({ token })}>
                {m.invite_accept()}
              </Button>
              <Button variant="ghost" disabled={accept.isPending} onPress={close}>
                {m.invite_later()}
              </Button>
            </View>
          )
        ) : (
          <View style={row}>
            <Button
              onPress={() =>
                stepAside(() =>
                  router.push({
                    pathname: "/sign-in",
                    params: {
                      mode: "sign-up",
                      invite: token,
                      reason: m.invite_reason({ username: found.username }),
                    },
                  }),
                )
              }
            >
              {m.auth_create_account()}
            </Button>
            {/* An account that signs in is asked again here whether it becomes a friend: it had
                no part in the link until then. */}
            <Button
              variant="ghost"
              onPress={() =>
                stepAside(() => router.push({ pathname: "/sign-in", params: { mode: "sign-in" } }))
              }
            >
              {m.invite_have_account()}
            </Button>
          </View>
        )
      ) : null}
    </DialogCard>
  );
}
