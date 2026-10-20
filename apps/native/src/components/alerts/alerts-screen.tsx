import type { Alert } from "@repo/client/viewer/types";
import { BellIcon, PlusIcon } from "@repo/ui/icon";
import { Stack, router } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, SectionList, View } from "react-native";

import { placeHref } from "@/components/map/place-route";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Segmented } from "@/components/ui/segmented";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";

import { AlertRow } from "./alert-row";
import { GroupTitle, GroupedCell } from "./grouped";
import { NoticeRow, NotificationRow } from "./news-rows";
import { type Told, byDay, placeOf, toldOf } from "./told";
import { useAlertActions, useAlerts } from "./use-alerts";
import { useNews } from "./use-news";

// The tab of the alerts, the web's `AlertsPanel` as a phone draws a list: a large title, a choice
// between what was told and the account's alerts, each a list grouped as the platform groups one.
// What was told comes in the days it came on, the newest first, under titles that stay while
// their rows scroll, each with a dot while it is not read, a swipe that reads it, and more as the
// list reaches its end. The alerts each have their switch, a swipe that pauses one for today and
// one that deletes it, and a long press with the rest. Both are pulled down to be read again.
// Decisions 031, 040, 068 and 072.

type View_ = "news" | "mine";
type Item = { kind: "told"; told: Told } | { kind: "alert"; alert: Alert };
type Group = { key: string; title: string | null; data: Item[] };

const keyOf = (item: Item) =>
  item.kind === "alert"
    ? `alert:${item.alert.id}`
    : item.told.kind === "notice"
      ? `notice:${item.told.notice.id}`
      : `notification:${item.told.notification.id}`;

/** The rows a list stands in for while it loads, in the shapes they will take. */
function Placeholder() {
  const { space } = useTheme();
  return (
    <Loading>
      {[0, 1, 2].map((index) => (
        <GroupedCell key={index} first={index === 0} last={index === 2}>
          <View style={{ flexDirection: "row", gap: space.s, padding: space.m }}>
            <Skeleton width={18} height={18} round />
            <View style={{ flex: 1, gap: space.xs }}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="70%" height={13} />
            </View>
          </View>
        </GroupedCell>
      ))}
    </Loading>
  );
}

/** A button of the header with a symbol and no name, a finger's size at least. */
function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: TARGET,
        minHeight: TARGET,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function AlertsScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const requireAccount = useRequireAccount();
  const [view, setView] = useState<View_>("news");
  const now = useNow();
  const news = useNews(signedIn && view === "news");
  const mine = useAlerts();
  const actions = useAlertActions();

  const newAlert = () => requireAccount(m.alerts_sign_in_prompt(), () => router.push("/alert/new"));

  const header = (
    <Stack.Screen
      options={{
        title: m.alerts_title(),
        headerRight: () =>
          !signedIn ? null : view === "news" ? (
            news.unreadHere > 0 ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  feel("done");
                  news.readAll();
                }}
                style={({ pressed }) => ({
                  minHeight: TARGET,
                  justifyContent: "center",
                  opacity: pressed ? 0.5 : 1,
                })}
              >
                <Text weight="medium" dense>
                  {m.native_mark_all_read()}
                </Text>
              </Pressable>
            ) : null
          ) : (
            <HeaderButton label={m.alert_new()} onPress={newAlert}>
              <Glyph icon={PlusIcon} size={22} color={colors["neutral-10"]} />
            </HeaderButton>
          ),
      }}
    />
  );

  if (!signedIn) {
    return (
      <>
        {header}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: colors["cte-canvas"] }}
          contentContainerStyle={{ paddingTop: space.l }}
        >
          {pending ? (
            <Placeholder />
          ) : (
            <EmptyState
              icon={BellIcon}
              title={m.alerts_title()}
              description={m.alerts_sign_in_prompt()}
              action={{
                label: m.auth_sign_in(),
                onPress: () => requireAccount(m.alerts_sign_in_prompt(), () => {}),
              }}
            />
          )}
        </ScrollView>
      </>
    );
  }

  const groups: Group[] =
    view === "news"
      ? byDay(toldOf(news.notifications ?? [], news.notices ?? []), now).map((day) => ({
          key: day.key,
          title: day.title,
          data: day.data.map((told): Item => ({ kind: "told", told })),
        }))
      : mine.alerts && mine.alerts.length > 0
        ? [
            {
              key: "mine",
              title: null,
              data: mine.alerts.map((alert): Item => ({ kind: "alert", alert })),
            },
          ]
        : [];

  const isPending = view === "news" ? news.isPending : mine.isPending;
  const isError = view === "news" ? news.isError : mine.isError;

  const empty = isPending ? (
    <Placeholder />
  ) : isError ? (
    <ErrorState
      title={view === "news" ? m.alerts_load_failed() : m.alerts_mine_load_failed()}
      onRetry={view === "news" ? news.refresh : mine.refetch}
    />
  ) : view === "news" ? (
    <EmptyState icon={BellIcon} title={m.alerts_empty()} />
  ) : (
    <EmptyState
      icon={BellIcon}
      title={m.alerts_mine_empty()}
      action={{ label: m.alert_create(), onPress: newAlert }}
    />
  );

  const renderItem = ({ item, index, section }: { item: Item; index: number; section: Group }) => {
    const first = index === 0;
    const last = index === section.data.length - 1;
    if (item.kind === "alert") {
      return (
        <GroupedCell first={first} last={last}>
          <AlertRow alert={item.alert} actions={actions} />
        </GroupedCell>
      );
    }
    const { told } = item;
    if (told.kind === "notice") {
      const { notice } = told;
      return (
        <GroupedCell first={first} last={last}>
          <NoticeRow
            notice={notice}
            now={now}
            onRead={() => news.readNotice(notice)}
            onOpen={() => {
              news.readNotice(notice);
              router.push(`${placeHref("break", notice.breakId)}?tab=reports` as Route);
            }}
          />
        </GroupedCell>
      );
    }
    const { notification } = told;
    return (
      <GroupedCell first={first} last={last}>
        <NotificationRow
          notification={notification}
          now={now}
          onRead={() => news.readNotification(notification)}
          onOpen={() => {
            news.readNotification(notification);
            // It opens the place it speaks of, as its push does; one of several is read here.
            const place = placeOf(notification);
            if (place) router.push(placeHref(place.kind, place.id));
          }}
        />
      </GroupedCell>
    );
  };

  return (
    <>
      {header}
      <SectionList<Item, Group>
        sections={groups}
        keyExtractor={keyOf}
        renderItem={renderItem}
        renderSectionHeader={({ section }) =>
          section.title ? <GroupTitle title={section.title} /> : null
        }
        stickySectionHeadersEnabled
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors["cte-canvas"] }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListHeaderComponent={
          <View
            style={{ paddingHorizontal: space.m, paddingTop: space.xs, paddingBottom: space.s }}
          >
            <Segmented<View_>
              label={m.alerts_title()}
              fill
              options={[
                {
                  value: "news",
                  label:
                    news.unreadHere > 0
                      ? `${m.alerts_tab_news()} · ${news.unreadHere}`
                      : m.alerts_tab_news(),
                },
                { value: "mine", label: m.alerts_tab_mine() },
              ]}
              value={view}
              onChange={setView}
            />
          </View>
        }
        ListEmptyComponent={<View style={{ paddingTop: space.s }}>{empty}</View>}
        ListFooterComponent={
          view === "news" && news.isLoadingMore ? (
            <View style={{ paddingTop: space.s }}>
              <Placeholder />
            </View>
          ) : view === "news" && news.hasMore && groups.length > 0 ? (
            <View style={{ alignItems: "center", paddingTop: space.m }}>
              <Button variant="ghost" onPress={news.loadMore}>
                {m.alerts_more_notices()}
              </Button>
            </View>
          ) : undefined
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (view === "news" && news.hasMore && !news.isLoadingMore) news.loadMore();
        }}
        refreshing={view === "news" ? news.isRefreshing : mine.isRefreshing}
        onRefresh={view === "news" ? news.refresh : mine.refresh}
      />
    </>
  );
}
