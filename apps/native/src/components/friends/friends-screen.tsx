import { APP_NAME } from "@repo/config/app";
import type { Friend } from "@repo/client/viewer/types";
import { ChevronRightIcon, CopyIcon, PersonIcon, ShareIcon, XIcon } from "@repo/ui/icon";
import { setStringAsync } from "expo-clipboard";
import { router } from "expo-router";
import { Fragment, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { SwipeRow } from "@/components/alerts/swipe-row";
import { ContributionRow } from "@/components/contributions/contribution-row";
import { openBreakGuide } from "@/components/guides/open-guide";
import { PageSheet, usePresented } from "@/components/guides/page-sheet";
import { RankBadge } from "@/components/guides/rank";
import { RANKS } from "@/components/guides/guide-words";
import { Tag } from "@/components/guides/tag";
import { confirmDestructive } from "@/components/saved/confirm";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { Row, Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { formatMonth } from "@/lib/format";
import { useRequireAccount } from "@/lib/require-account";
import { shareLink } from "@/lib/share";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { light } from "@/theme/tokens";

import { type Choice, chooseAmong } from "./asking";
import { useBlock } from "./blocking";
import { QrCode } from "./qr-code";
import { useFriendDetail, useFriends } from "./use-friends";

// The account's link and the friends it made, one step into the account's tab, as the web's
// `FriendsPanel` shows them: decision 041. The link is a code for a camera and an address for the
// phone's own sheet. A friend is read by a username, a rank and what they wrote that was
// confirmed, and by nothing else.

const QR_SIZE = 208;

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
        title={m.friends_failed()}
        onRetry={() => void friending.link.refetch()}
        retrying={friending.link.isRefetching}
      />
    ) : (
      <Loading>
        <View style={{ alignItems: "center" }}>
          <Skeleton width={QR_SIZE + 2 * space.s} height={QR_SIZE + 2 * space.s} />
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
  const renew = async () => {
    const yes = await confirmDestructive({
      title: m.friends_link_renew(),
      message: m.native_friends_renew_text(),
      confirm: m.friends_link_renew(),
    });
    if (yes) friending.renew();
  };

  return (
    <View style={{ alignItems: "center", gap: space.m }}>
      {/* White around the code, whatever the theme: a camera reads its quiet zone. */}
      <View
        style={{
          padding: space.s,
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: light["neutral-1"],
        }}
      >
        <QrCode text={address} label={m.friends_qr_label()} size={QR_SIZE} />
      </View>
      <Text size="s" tone="muted" selectable numberOfLines={1} style={{ textAlign: "center" }}>
        {address.replace(/^https?:\/\//, "")}
      </Text>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs }}
      >
        <Button icon={ShareIcon} onPress={share}>
          {m.friends_link_share()}
        </Button>
        <Button variant="secondary" icon={CopyIcon} onPress={() => void copy()}>
          {m.friends_link_copy()}
        </Button>
      </View>
      <Button variant="ghost" loading={friending.isRenewing} onPress={() => void renew()}>
        {m.friends_link_renew()}
      </Button>
    </View>
  );
}

/**
 * One friend: who they are, and what a press, a long press or a swipe does with them. A swipe
 * from the trailing edge ends the friendship, once asked; a screen reader reaches the same
 * actions as the long press, in the row's own.
 */
function FriendRow({
  friend,
  actions,
  onOpen,
}: {
  friend: Friend;
  actions: Choice[];
  onOpen: () => void;
}) {
  const { colors, space } = useTheme();
  const sponsored = sponsoredOf(friend);
  const remove = actions.find((action) => action.name === "remove");
  const label = [
    nameOf(friend),
    friend.rank ? m.rank_label({ name: RANKS[friend.rank].name() }) : undefined,
    sponsored?.label,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SwipeRow
      trailing={
        remove
          ? { label: m.native_remove(), icon: XIcon, tone: "danger", onAct: remove.onPress }
          : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={m.native_friend_hint()}
        accessibilityActions={actions.map(({ name, label: said }) => ({ name, label: said }))}
        onAccessibilityAction={(event) =>
          actions.find((action) => action.name === event.nativeEvent.actionName)?.onPress()
        }
        onPress={onOpen}
        onLongPress={() => {
          feel("hold");
          chooseAmong(nameOf(friend), actions);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          minHeight: TARGET,
          paddingHorizontal: space.m,
          paddingVertical: space.s,
          // The row's own ground, over the action that the swipe uncovers behind it.
          backgroundColor: pressed ? colors["neutral-3"] : colors["cte-surface"],
        })}
      >
        <View style={{ flex: 1, gap: space.xxs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
              {nameOf(friend)}
            </Text>
            {friend.rank ? <RankBadge rank={friend.rank} /> : null}
          </View>
          {sponsored ? <Tag tone={sponsored.tone}>{sponsored.label}</Tag> : null}
        </View>
        <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} />
      </Pressable>
    </SwipeRow>
  );
}

/** A friend read whole, in a sheet: their rank, since when, and what they wrote that was confirmed. */
function FriendSheet({
  friend,
  visible,
  onClose,
  onDismissed,
  actions,
  onOpenBreak,
}: {
  friend: Friend;
  visible: boolean;
  onClose: () => void;
  onDismissed: () => void;
  actions: Choice[];
  onOpenBreak: (breakId: string) => void;
}) {
  const { space } = useTheme();
  const detail = useFriendDetail(friend.id);
  const sponsored = sponsoredOf(friend);
  const contributions = detail.data?.contributions;

  return (
    <PageSheet visible={visible} title={nameOf(friend)} onClose={onClose} onDismissed={onDismissed}>
      <View style={{ gap: space.xs }}>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
        >
          {friend.rank ? (
            <>
              <RankBadge rank={friend.rank} />
              <Text size="s" tone="muted">
                {RANKS[friend.rank].name()}
              </Text>
            </>
          ) : (
            <Text size="s" tone="muted">
              {m.contributions_no_rank()}
            </Text>
          )}
          {sponsored ? <Tag tone={sponsored.tone}>{sponsored.label}</Tag> : null}
        </View>
        <Text size="s" tone="muted">
          {m.native_friend_since({ date: formatMonth(friend.since) })}
        </Text>
      </View>

      {contributions ? (
        contributions.length === 0 ? (
          <Text tone="muted">{m.friends_contributions_empty()}</Text>
        ) : (
          <Surface insetEdge style={{ overflow: "hidden" }}>
            {contributions.map((one, index) => (
              <Fragment key={one.id}>
                {index > 0 ? <Separator inset={space.m} /> : null}
                <ContributionRow one={one} onOpenBreak={onOpenBreak} />
              </Fragment>
            ))}
          </Surface>
        )
      ) : detail.isError ? (
        <ErrorState
          title={m.friends_failed()}
          onRetry={() => void detail.refetch()}
          retrying={detail.isRefetching}
        />
      ) : (
        <Loading>
          <SkeletonText lines={4} />
        </Loading>
      )}

      <Section>
        {actions.map((action) => (
          <Row
            key={action.label}
            title={action.label}
            destructive={action.destructive}
            chevron={false}
            onPress={action.onPress}
          />
        ))}
      </Section>
    </PageSheet>
  );
}

/**
 * One step into the account's tab: the link the account gives to whoever it wants as a friend,
 * and the friends it made, with what ends a friendship and what blocks a friend (decision 071).
 */
export function FriendsScreen() {
  const { space } = useTheme();
  const { signedIn, pending, username } = useAccount();
  const requireAccount = useRequireAccount();
  const friending = useFriends(username);
  const sheet = usePresented<Friend>();
  const { block } = useBlock({ onBlocked: () => sheet.dismiss() });
  const [refreshing, setRefreshing] = useState(false);
  const friends = friending.friends.data;

  const refresh = async () => {
    setRefreshing(true);
    await friending.refresh().catch(() => {});
    setRefreshing(false);
  };

  const actionsOf = (friend: Friend): Choice[] => [
    {
      name: "remove",
      label: m.friends_remove(),
      onPress: () =>
        void confirmDestructive({
          title: m.friends_remove(),
          message: m.native_friends_remove_text(),
          confirm: m.friends_remove_confirm(),
        }).then((yes) => {
          if (yes) friending.remove(friend.id, () => sheet.dismiss());
        }),
    },
    // Ends the friendship too, and hides the friend's reports and name. A friend with no name
    // is blocked by none.
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
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {pending ? null : (
          <EmptyState
            icon={PersonIcon}
            title={m.friends_title()}
            description={m.friends_hint()}
            action={{
              label: m.auth_sign_in(),
              onPress: () => requireAccount(m.friends_hint(), () => {}),
            }}
          />
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
    >
      <View style={{ gap: space.xs }}>
        <Text
          size="s"
          weight="medium"
          tone="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: space.m }}
        >
          {m.friends_link_title()}
        </Text>
        <Surface style={{ padding: space.l, gap: space.m }}>
          {username === null ? (
            <View style={{ gap: space.s }}>
              <Text>{m.friends_username_first()}</Text>
              <Button fill onPress={() => router.push("/account/username")}>
                {m.username_choose()}
              </Button>
            </View>
          ) : (
            <OwnLink friending={friending} />
          )}
        </Surface>
        <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.friends_link_text()}
        </Text>
      </View>

      <View style={{ gap: space.xs }}>
        <Text
          size="s"
          weight="medium"
          tone="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: space.m }}
        >
          {m.friends_list_title()}
        </Text>
        {friends ? (
          friends.length === 0 ? (
            <Surface>
              <EmptyState icon={PersonIcon} title={m.friends_empty()} />
            </Surface>
          ) : (
            <Surface insetEdge style={{ overflow: "hidden" }}>
              {friends.map((friend, index) => (
                <Fragment key={friend.id}>
                  {index > 0 ? <Separator inset={space.m} /> : null}
                  <FriendRow
                    friend={friend}
                    actions={actionsOf(friend)}
                    onOpen={() => sheet.present(friend)}
                  />
                </Fragment>
              ))}
            </Surface>
          )
        ) : friending.friends.isError ? (
          <ErrorState
            title={m.friends_failed()}
            onRetry={() => void friending.friends.refetch()}
            retrying={friending.friends.isRefetching}
          />
        ) : (
          <Loading>
            <View style={{ gap: space.xs }}>
              <Skeleton height={TARGET} />
              <Skeleton height={TARGET} />
            </View>
          </Loading>
        )}
      </View>

      {sheet.shown ? (
        <FriendSheet
          key={sheet.shown.id}
          // What the list says now, once it changed while the sheet was open.
          friend={friends?.find((one) => one.id === sheet.shown?.id) ?? sheet.shown}
          visible={sheet.visible}
          onClose={() => sheet.dismiss()}
          onDismissed={sheet.dismissed}
          actions={actionsOf(sheet.shown)}
          onOpenBreak={(breakId) => sheet.dismiss(() => openBreakGuide(breakId))}
        />
      ) : null}
    </ScrollView>
  );
}
