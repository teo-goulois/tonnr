import { APP_NAME } from "@repo/config/app";
import type { Friend, FriendDetail } from "@repo/client/viewer/types";
import { ChevronDownIcon, CopyIcon, ShareIcon, XIcon } from "@repo/ui/icon";
import { setStringAsync } from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { RankBadge, rankName } from "@/components/account/rank-badge";
import { Step } from "@/components/account/settings-steps";
import { UsernameForm } from "@/components/account/username-form";
import { SwipeRow } from "@/components/alerts/swipe-row";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { readContribution } from "@/components/guides/guide-words";
import { openBreakGuide } from "@/components/guides/open-guide";
import { confirmDestructive } from "@/components/saved/confirm";
import { Glyph } from "@/components/shared/glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { shareLink } from "@/lib/share";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { type Choice, chooseAmong } from "./asking";
import { useBlock } from "./blocking";
import { QrCode } from "./qr-code";
import { useFriendDetail, useFriends } from "./use-friends";

// The account's link and the friends it made, one step into the account's tab, as the web's
// `FriendsPanel` draws them on a phone: decision 041. The link is a code for a camera and an
// address for the phone's own sheet. A friend is read by a username, a rank and what they wrote
// that was confirmed, and by nothing else: a press unfolds it in the list, one at a time.

/** The web's `size-40`: the code with its own quiet zone, which needs no frame. */
const QR_SIZE = 160;

/** The step's name a friend reads by: `@name`, or that it has none yet. */
const nameOf = (friend: Pick<Friend, "username">) =>
  friend.username ? `@${friend.username}` : m.friends_no_name();

/** What says a friend was brought by the account, and whether it counts yet. */
function sponsoredOf(friend: Friend) {
  if (!friend.sponsored) return undefined;
  return friend.sponsored === "counted"
    ? { label: m.friends_sponsored_counted(), tone: "success" as const }
    : { label: m.friends_sponsored_waiting(), tone: "neutral" as const };
}

/** The link an account gives: its code for a camera, and what sends it. */
function OwnLink({ friending }: { friending: ReturnType<typeof useFriends> }) {
  const { space, radius } = useTheme();
  const tell = useTell();
  const { address } = friending;

  if (!address) {
    return friending.link.isError ? (
      <ErrorState
        plain
        title={m.friends_failed()}
        onRetry={() => void friending.link.refetch()}
        retrying={friending.link.isRefetching}
      />
    ) : (
      <Loading>
        <View style={{ alignItems: "center" }}>
          <Skeleton width={QR_SIZE} height={QR_SIZE} />
        </View>
      </Loading>
    );
  }

  // The phone's own sheet sends it: a message, a nearby phone, a note.
  const share = () =>
    void shareLink({
      title: APP_NAME,
      message: m.friends_share_text({ name: APP_NAME }),
      url: address,
    });
  const copy = async () => {
    try {
      await setStringAsync(address);
      tell({ title: m.friends_link_copied(), tone: "success" });
    } catch {
      tell({ title: m.friends_link_copy_failed(), tone: "danger" });
    }
  };

  return (
    <View style={{ gap: space.s }}>
      {/* The code is white around itself, whatever the theme: a camera reads its quiet zone. */}
      <View
        style={{
          alignSelf: "center",
          borderRadius: radius.xs,
          borderCurve: "continuous",
          overflow: "hidden",
        }}
      >
        <QrCode text={address} label={m.friends_qr_label()} size={QR_SIZE} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button icon={ShareIcon} onPress={share}>
          {m.friends_link_share()}
        </Button>
        <Button variant="secondary" icon={CopyIcon} onPress={() => void copy()}>
          {m.friends_link_copy()}
        </Button>
        {/* It renews at once: its toast says that the link before opens nothing. */}
        <Button variant="ghost" loading={friending.isRenewing} onPress={friending.renew}>
          {m.friends_link_renew()}
        </Button>
      </View>
    </View>
  );
}

/** The chevron of a friend's row, which turns over as the row unfolds, on the theme's motion. */
function Unfolding({ open }: { open: boolean }) {
  const { colors, motion } = useTheme();
  const turn = useSharedValue(open ? 180 : 0);
  // Reanimated holds it still for a reader who asked for no motion, as the web's does.
  useEffect(() => {
    turn.set(
      withTiming(open ? 180 : 0, {
        duration: motion.duration,
        easing: Easing.bezier(...motion.easing),
      }),
    );
  }, [open, turn, motion]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={turned}>
      <Glyph icon={ChevronDownIcon} size={16} color={colors["neutral-7"]} />
    </Animated.View>
  );
}

type Written = FriendDetail["contributions"][number];

/**
 * One thing a friend wrote, on two lines as the web's: the break, which opens its guide, and the
 * line it is of, then what it says. A break that left the catalogue opens nothing.
 */
function FriendContribution({
  one,
  onOpenBreak,
}: {
  one: Written;
  onOpenBreak: (breakId: string) => void;
}) {
  const { space } = useTheme();
  const { label, value } = readContribution(one);
  const place = one.break;
  return (
    <View style={{ gap: space.xxs }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: space.xs,
        }}
      >
        {place ? (
          // A ghost button whose name stands in line with what is under it, as the web's `-ml-xs`.
          <Button
            variant="ghost"
            accessibilityHint={m.native_contribution_open_hint()}
            onPress={() => onOpenBreak(place.id)}
            style={{ marginStart: -space.xs, paddingHorizontal: space.xs, maxWidth: "100%" }}
          >
            {place.name}
          </Button>
        ) : (
          <Text size="s" tone="muted">
            {m.contribution_break_gone()}
          </Text>
        )}
        <Text size="s" tone="muted">
          {label}
        </Text>
      </View>
      {value ? <Text size="s">{value}</Text> : null}
    </View>
  );
}

/**
 * One friend: who they are, and, once a press unfolds them, what they wrote and what ends the
 * friendship, which asks in place before it ends it, as the web's does. A swipe from the trailing
 * edge and a long press reach the same, asked in the platform's own words; so does a screen
 * reader, through the row's actions.
 */
function FriendRow({
  friend,
  isOpen,
  onToggle,
  detail,
  actions,
  isRemoving,
  onRemove,
  onBlock,
  onOpenBreak,
}: {
  friend: Friend;
  isOpen: boolean;
  onToggle: () => void;
  /** What the friend wrote, while the row is unfolded. */
  detail: ReturnType<typeof useFriendDetail>;
  actions: Choice[];
  isRemoving: boolean;
  onRemove: () => void;
  onBlock: (username: string) => void;
  onOpenBreak: (breakId: string) => void;
}) {
  const { colors, space, radius } = useTheme();
  const [isEnding, setEnding] = useState(false);
  const sponsored = sponsoredOf(friend);
  const remove = actions.find((action) => action.name === "remove");
  const label = [
    nameOf(friend),
    friend.rank ? m.rank_label({ name: rankName(friend.rank) }) : undefined,
    sponsored?.label,
  ]
    .filter(Boolean)
    .join(", ");
  const contributions = isOpen ? detail.data?.contributions : undefined;

  return (
    <View style={{ gap: space.xs }}>
      {/* The row's room is laid outside the words, as the web's `-mx-xs px-xs`, so that its
          words stand in line with the title and only its press shows it. */}
      <View style={{ marginHorizontal: -space.xs }}>
        <SwipeRow
          trailing={
            remove
              ? { label: m.friends_remove(), icon: XIcon, tone: "danger", onAct: remove.onPress }
              : undefined
          }
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={m.native_friend_hint()}
            accessibilityState={{ expanded: isOpen }}
            accessibilityActions={actions.map(({ name, label: said }) => ({ name, label: said }))}
            onAccessibilityAction={(event) =>
              actions.find((action) => action.name === event.nativeEvent.actionName)?.onPress()
            }
            onPress={() => {
              setEnding(false);
              onToggle();
            }}
            onLongPress={() => {
              feel("hold");
              chooseAmong(nameOf(friend), actions);
            }}
            // The screen's own ground, over the action that the swipe uncovers behind it.
            style={{ backgroundColor: colors["cte-canvas"] }}
          >
            {({ pressed }) => (
              <View
                style={{
                  minHeight: TARGET,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: space.s,
                  paddingHorizontal: space.xs,
                  borderRadius: radius.xs,
                  borderCurve: "continuous",
                  backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    columnGap: space.xs,
                    rowGap: space.xxs,
                  }}
                >
                  <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {nameOf(friend)}
                  </Text>
                  {friend.rank ? <RankBadge rank={friend.rank} /> : null}
                  {sponsored ? <Badge tone={sponsored.tone}>{sponsored.label}</Badge> : null}
                </View>
                <Unfolding open={isOpen} />
              </View>
            )}
          </Pressable>
        </SwipeRow>
      </View>

      {isOpen ? (
        <View style={{ gap: space.s, paddingBottom: space.xs }}>
          {!contributions ? (
            detail.isError ? (
              <ErrorState
                plain
                title={m.friends_failed()}
                onRetry={() => void detail.refetch()}
                retrying={detail.isRefetching}
              />
            ) : (
              <Loading>
                <Skeleton height={20} />
              </Loading>
            )
          ) : contributions.length === 0 ? (
            <Text size="s" tone="muted">
              {m.friends_contributions_empty()}
            </Text>
          ) : (
            <View style={{ gap: space.s }}>
              {contributions.map((one) => (
                <FriendContribution key={one.id} one={one} onOpenBreak={onOpenBreak} />
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {isEnding ? (
              <>
                <Button variant="outline" loading={isRemoving} onPress={onRemove}>
                  {m.friends_remove_confirm()}
                </Button>
                <Button variant="ghost" disabled={isRemoving} onPress={() => setEnding(false)}>
                  {m.action_cancel()}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onPress={() => setEnding(true)}>
                  {m.friends_remove()}
                </Button>
                {/* Ends the friendship too, and hides the friend's reports and name: decision
                    071. A friend with no name is blocked by none. */}
                {friend.username ? (
                  <Button
                    variant="ghost"
                    destructive
                    onPress={() => friend.username && onBlock(friend.username)}
                  >
                    {m.block_account({ username: friend.username })}
                  </Button>
                ) : null}
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One step into the account's tab: the link the account gives to whoever it wants as a friend,
 * and the friends it made, with what ends a friendship and what blocks a friend (decision 071).
 * A visitor is asked for an account, and comes back here once signed in.
 */
export function FriendsScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending, userId, username } = useAccount();
  const friending = useFriends(username);
  // The friend whose row is unfolded, for the account that unfolded it, as the web keeps it.
  const [opened, setOpened] = useState<{ account: string | undefined; id: string }>();
  const openedId = opened !== undefined && opened.account === userId ? opened.id : undefined;
  const detail = useFriendDetail(openedId);
  const { block } = useBlock({ onBlocked: () => setOpened(undefined) });
  const [refreshing, setRefreshing] = useState(false);
  const friends = friending.friends.data;

  const refresh = async () => {
    setRefreshing(true);
    await friending.refresh().catch(() => {});
    setRefreshing(false);
  };
  const removeFriend = (friend: Friend) => friending.remove(friend.id, () => setOpened(undefined));

  // What a long press, a swipe and a screen reader's actions reach: ending the friendship is
  // asked there in the platform's own words, as the unfolded row asks it in place.
  const actionsOf = (friend: Friend): Choice[] => [
    {
      name: "remove",
      label: m.friends_remove(),
      onPress: () =>
        void confirmDestructive({
          title: m.friends_remove(),
          confirm: m.friends_remove_confirm(),
        }).then((yes) => {
          if (yes) removeFriend(friend);
        }),
    },
    ...(friend.username
      ? [
          {
            name: "block",
            label: m.block_account({ username: friend.username }),
            destructive: true,
            onPress: () => friend.username && block(friend.username),
          },
        ]
      : []),
  ];

  if (!signedIn) {
    return (
      <Step title={m.friends_title()}>
        {pending ? null : (
          <AccountPrompt text={m.account_sign_in_prompt()} next="/account/friends" />
        )}
      </Step>
    );
  }

  return (
    <Step
      title={m.friends_title()}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      <Section plain title={m.friends_link_title()} lead={m.friends_link_text()}>
        {username === null ? (
          <View style={{ gap: space.xs }}>
            <Text size="s">{m.friends_username_first()}</Text>
            {/* Once it is saved, the account's name comes back and its link loads here. */}
            <UsernameForm current={null} onSaved={() => {}} />
          </View>
        ) : (
          <OwnLink friending={friending} />
        )}
      </Section>

      <Section plain title={m.friends_list_title()}>
        {friends ? (
          friends.length === 0 ? (
            <Text size="s" tone="muted">
              {m.friends_empty()}
            </Text>
          ) : (
            <View style={{ gap: space.xxs }}>
              {friends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  isOpen={openedId === friend.id}
                  onToggle={() =>
                    setOpened(
                      openedId === friend.id ? undefined : { account: userId, id: friend.id },
                    )
                  }
                  detail={detail}
                  actions={actionsOf(friend)}
                  isRemoving={friending.isRemoving}
                  onRemove={() => removeFriend(friend)}
                  onBlock={block}
                  onOpenBreak={openBreakGuide}
                />
              ))}
            </View>
          )
        ) : friending.friends.isError ? (
          <ErrorState
            plain
            title={m.friends_failed()}
            onRetry={() => void friending.friends.refetch()}
            retrying={friending.friends.isRefetching}
          />
        ) : (
          <Loading>
            <Skeleton height={TARGET} />
          </Loading>
        )}
      </Section>
    </Step>
  );
}
