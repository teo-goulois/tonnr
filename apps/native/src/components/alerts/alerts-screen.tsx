import type { Alert } from "@repo/client/viewer/types";
import { SettingsIcon } from "@repo/ui/icon";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { placeHref } from "@/components/map/place-route";
import { openPlaceOnMap } from "@/components/sessions/session-place";
import { Button, IconButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";

import { AlertRow } from "./alert-row";
import { NoticeRow, NotificationRow } from "./news-rows";
import { type Told, toldOf } from "./told";
import { useAlertActions, useAlerts } from "./use-alerts";
import { useNews } from "./use-news";

// The tab of the alerts, the web's `AlertsPanel` as a phone's tab draws it: the platform's large
// title with the web's one action, the gear that opens the alerts' settings in the account's
// tab, then the underlined tabs of what was told and of the account's alerts, whose rows stand
// on the screen's own ground. What was told is one list, the newest first, the notifications and
// the notices of reports together: a notification is pressed to be read, and a notice opens its
// break on its reports, on the map. The alerts each have their switch. A visitor is asked for an
// account. What the web has not stays out of sight until it is reached for: the swipes and the
// long press of a row, and a list pulled down to be read again. The tab in view is in the
// address, `?view=mine`, as it is in the web's, `?alerts=mine`. Decisions 031, 040, 068 and 072.

type View_ = "news" | "mine";
type Item = { kind: "told"; told: Told } | { kind: "alert"; alert: Alert };

const keyOf = (item: Item) =>
  item.kind === "alert"
    ? `alert:${item.alert.id}`
    : item.told.kind === "notice"
      ? `notice:${item.told.notice.id}`
      : `notification:${item.told.notification.id}`;

/** What was told while it loads, the web's `AlertRowSkeleton`: a sign and two lines, three times. */
function NewsPlaceholder() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.xxs }}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={{ flexDirection: "row", gap: space.s, padding: space.xs }}>
            <View style={{ paddingTop: 2 }}>
              <Skeleton width={18} height={18} round />
            </View>
            <View style={{ flex: 1, gap: space.xxs }}>
              <Skeleton width="40%" height={type.m.line} />
              <Skeleton width="60%" height={type.s.line} />
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}

/** The alerts while they load, as the web's `MyAlerts` waits: two lines. */
function MinePlaceholder() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.s, paddingHorizontal: space.xs }}>
        <Skeleton width="40%" height={type.m.line} />
        <Skeleton width="60%" height={type.m.line} />
      </View>
    </Loading>
  );
}

/** The room between two rows, the web's `gap-xxs`. */
function Gap() {
  const { space } = useTheme();
  return <View style={{ height: space.xxs }} />;
}

export function AlertsScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const params = useLocalSearchParams<{ view?: string }>();
  const view: View_ = params.view === "mine" ? "mine" : "news";
  const now = useNow();
  const news = useNews(signedIn && view === "news");
  const mine = useAlerts();
  const actions = useAlertActions();

  const header = (
    <Stack.Screen
      options={{
        // How to be told is a setting of the account: its tab opens on it, as the web's panel.
        // The web's ghost gear, its icon at the web's size, in a button the platform's bar holds.
        headerRight: signedIn
          ? () => (
              <IconButton
                icon={SettingsIcon}
                label={m.command_alerts_settings()}
                variant="ghost"
                size="small"
                iconSize={20}
                onPress={() => router.navigate("/account/alerts")}
              />
            )
          : undefined,
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
          contentContainerStyle={{ padding: space.m }}
        >
          {pending ? (
            // The rows' room is laid outside the words, as in the list.
            <View style={{ marginHorizontal: -space.xs }}>
              {view === "mine" ? <MinePlaceholder /> : <NewsPlaceholder />}
            </View>
          ) : (
            <AccountPrompt text={m.alerts_sign_in_prompt()} />
          )}
        </ScrollView>
      </>
    );
  }

  // What was told waits for both kinds, as the web's panel does, so that the notices do not come
  // in among the notifications once these are drawn.
  const items: Item[] =
    view === "news"
      ? news.isPending
        ? []
        : toldOf(news.notifications ?? [], news.notices ?? []).map((told) => ({
            kind: "told",
            told,
          }))
      : (mine.alerts ?? []).map((alert) => ({ kind: "alert", alert }));

  // What the alerts told could not be loaded: it is said over the notices that came, which stay,
  // where the web's panel says it alone.
  const newsFailed =
    view === "news" && !news.isPending && news.isError && news.notifications === undefined;

  const line = (text: string) => (
    <Text tone="muted" style={{ paddingHorizontal: space.xs }}>
      {text}
    </Text>
  );
  const empty =
    view === "news" ? (
      news.isPending ? (
        <NewsPlaceholder />
      ) : newsFailed ? undefined : (
        line(m.alerts_empty())
      )
    ) : mine.isPending ? (
      <MinePlaceholder />
    ) : mine.isError ? (
      <View style={{ paddingHorizontal: space.xs }}>
        <ErrorState
          plain
          title={m.alerts_mine_load_failed()}
          onRetry={mine.refresh}
          retrying={mine.isRefreshing}
        />
      </View>
    ) : (
      line(m.alerts_mine_empty())
    );

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === "alert") return <AlertRow alert={item.alert} actions={actions} plain />;
    const { told } = item;
    if (told.kind === "notice") {
      const { notice } = told;
      return (
        <NoticeRow
          notice={notice}
          now={now}
          onRead={() => news.readNotice(notice)}
          onOpen={() => {
            news.readNotice(notice);
            openPlaceOnMap(`${placeHref("break", notice.breakId)}?tab=reports` as Route);
          }}
        />
      );
    }
    const { notification } = told;
    return (
      <NotificationRow
        notification={notification}
        now={now}
        onRead={() => news.readNotification(notification)}
      />
    );
  };

  return (
    <>
      {header}
      <FlatList<Item>
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors["cte-canvas"] }}
        // The rows' room is laid outside the words, which stand in line with the tabs, as the
        // web's `-mx-xs` list of `px-xs` rows.
        contentContainerStyle={{
          paddingHorizontal: space.m - space.xs,
          paddingTop: space.m,
          paddingBottom: space.xxl,
        }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.xs, paddingBottom: space.m, gap: space.m }}>
            <Tabs<View_>
              label={m.alerts_title()}
              options={[
                { value: "news", label: m.alerts_tab_news() },
                { value: "mine", label: m.alerts_tab_mine() },
              ]}
              value={view}
              onChange={(next) => router.setParams({ view: next })}
            />
            {newsFailed ? (
              <ErrorState
                plain
                title={m.alerts_load_failed()}
                onRetry={news.refresh}
                retrying={news.isRefreshing}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          // The older notices of reports, which the list loads a page at a time: decision 068.
          view === "news" && news.hasMoreNotices && items.length > 0 ? (
            <View
              style={{ alignItems: "flex-start", paddingHorizontal: space.xs, paddingTop: space.s }}
            >
              <Button
                variant="ghost"
                loading={news.isLoadingMoreNotices}
                onPress={news.loadMoreNotices}
              >
                {m.alerts_more_notices()}
              </Button>
            </View>
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={view === "news" ? news.isRefreshing : mine.isRefreshing}
            onRefresh={view === "news" ? news.refresh : mine.refresh}
            tintColor={colors["neutral-7"]}
          />
        }
      />
    </>
  );
}
