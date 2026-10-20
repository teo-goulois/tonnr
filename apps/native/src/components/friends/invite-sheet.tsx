import { ShakaHandFillDuoIcon } from "@repo/ui/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { PageSheet } from "@/components/guides/page-sheet";
import { RankBadge } from "@/components/account/rank-badge";
import { UsernameForm } from "@/components/account/username-form";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
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
// web's `InviteDialog` says it (decision 041). A visitor is asked for an account, which is then
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

/**
 * The invitation of a link, for the map tab to show while its address names one. `onDone` takes
 * the link out of the address once it made what it makes, or was left. The sheet steps aside
 * while the person signs in or signs up, and comes back once they do.
 */
export function InviteSheet({ token, onDone }: { token: string; onDone: () => void }) {
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

  return (
    <PageSheet
      visible={visible}
      title={m.friends_title()}
      onClose={close}
      onDismissed={() => {
        const go = next.current;
        next.current = null;
        go?.();
      }}
    >
      <View style={{ alignItems: "center", gap: space.m, paddingTop: space.l }}>
        <Glyph icon={ShakaHandFillDuoIcon} size={56} />
        {found ? (
          <View style={{ alignItems: "center", gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Text
                size="l"
                weight="medium"
                accessibilityRole="header"
                style={{ textAlign: "center", flexShrink: 1 }}
              >
                {m.invite_title({ username: found.username })}
              </Text>
              {found.rank ? <RankBadge rank={found.rank} /> : null}
            </View>
            <Text tone="muted" style={{ textAlign: "center" }}>
              {isOwn ? m.invite_own() : signedIn ? m.invite_text_signed_in() : m.invite_text()}
            </Text>
          </View>
        ) : isBlocked || isGone ? (
          <View style={{ alignItems: "center", gap: space.xs }}>
            <Text
              size="l"
              weight="medium"
              accessibilityRole="header"
              style={{ textAlign: "center" }}
            >
              {isBlocked ? m.invite_blocked() : m.invite_gone()}
            </Text>
            {isBlocked ? (
              <Text tone="muted" style={{ textAlign: "center" }}>
                {m.invite_blocked_text()}
              </Text>
            ) : null}
          </View>
        ) : (
          <Loading>
            <View style={{ alignItems: "center", gap: space.xs }}>
              <Skeleton width={220} height={24} />
              <Skeleton width={280} height={16} />
            </View>
          </Loading>
        )}
      </View>

      {found && !isOwn ? (
        signedIn ? (
          username === null && !isNamed ? (
            // A friend is read by a name: an account that has none chooses it here, as the web's
            // invitation asks for it, and becomes a friend after.
            <View style={{ gap: space.s }}>
              <Text style={{ textAlign: "center" }}>{m.invite_username_first()}</Text>
              <UsernameForm current={null} onSaved={() => setIsNamed(true)} />
            </View>
          ) : (
            <View style={{ gap: space.xs }}>
              <Button fill loading={accept.isPending} onPress={() => accept.mutate({ token })}>
                {m.invite_accept()}
              </Button>
              <Button variant="ghost" fill disabled={accept.isPending} onPress={close}>
                {m.invite_later()}
              </Button>
            </View>
          )
        ) : (
          <View style={{ gap: space.xs }}>
            <Button
              fill
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
              fill
              onPress={() =>
                stepAside(() => router.push({ pathname: "/sign-in", params: { mode: "sign-in" } }))
              }
            >
              {m.invite_have_account()}
            </Button>
          </View>
        )
      ) : null}
    </PageSheet>
  );
}
