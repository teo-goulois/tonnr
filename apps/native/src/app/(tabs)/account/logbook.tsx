import { byMonth } from "@repo/client/sessions/rules";
import type { Session } from "@repo/client/viewer/types";
import { PlusIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { MonthGroup, Recap } from "@/components/sessions/logbook";
import { useSessionLog, useSessionWrites } from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { formatMonth } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** The log to come, as the web's: the two tiles of the recap, then two lines. */
function LogSkeleton() {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.m }}>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          <View style={{ flex: 1 }}>
            <Skeleton height={96} corner="s" />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={96} corner="s" />
          </View>
        </View>
        <Skeleton height={type.m.line} width="60%" />
        <Skeleton height={type.m.line} width="80%" />
      </View>
    </Loading>
  );
}

const addSession = () => router.push("/session/new");

/** What begins a session and asks where, as the web's log offers it. */
function AddButton() {
  return (
    <Button
      variant="secondary"
      icon={PlusIcon}
      onPress={addSession}
      style={{ alignSelf: "flex-start" }}
    >
      {m.session_add()}
    </Button>
  );
}

/**
 * The account's log of its sessions, one step into the account's tab, as the web's
 * `LogbookPanel` draws it: what it comes to this month and this year, the places it surfs most,
 * what adds a session, then every session month by month, each opening its sheet. A swipe
 * deletes one and a pull reads the log again, as a phone's lists do. A visitor is asked for an
 * account in the words of the web's account panel, which a visitor's link to the log shows, and
 * comes back here once signed in. Decision 043.
 */
export default function Logbook() {
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const { signedIn, pending } = useAccount();
  const { log, recap, media } = useSessionLog();
  const writes = useSessionWrites();
  // "Today" and "Yesterday" follow the clock while the log stays open.
  const now = useNow();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const months = useMemo(() => byMonth(log.data ?? [], formatMonth), [log.data]);

  async function refresh() {
    setIsRefreshing(true);
    await Promise.all([
      log.refetch(),
      recap.refetch(),
      queryClient.invalidateQueries({ queryKey: orpc.v1.media.sessions.key() }),
    ]).finally(() => setIsRefreshing(false));
  }

  // What stands where the months would: a visitor's prompt, the log to come, what failed, or
  // the empty log's sentence with what adds a session.
  const instead = !signedIn ? (
    pending ? (
      <LogSkeleton />
    ) : (
      <AccountPrompt text={m.account_sign_in_prompt()} next="/account/logbook" />
    )
  ) : log.isError ? (
    <ErrorState
      plain
      title={m.sessions_load_failed()}
      onRetry={() => void log.refetch()}
      retrying={log.isFetching}
    />
  ) : !log.data ? (
    <LogSkeleton />
  ) : (
    <View style={{ gap: space.m, alignItems: "flex-start" }}>
      <Text tone="muted">{m.sessions_empty()}</Text>
      <AddButton />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <Stack.Screen options={{ title: m.sessions_title() }} />
      <FlatList
        data={signedIn ? months : []}
        keyExtractor={(month) => month.name}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
        refreshControl={
          signedIn ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refresh()}
              tintColor={colors["neutral-7"]}
            />
          ) : undefined
        }
        ListHeaderComponent={
          signedIn && log.data && log.data.length > 0 ? (
            <View style={{ gap: space.l }}>
              {recap.data ? <Recap recap={recap.data} /> : null}
              <AddButton />
            </View>
          ) : undefined
        }
        ListEmptyComponent={instead}
        renderItem={({ item }) => (
          <MonthGroup
            month={item}
            now={now}
            media={media}
            onDelete={(session: Session) => void writes.remove(session)}
          />
        )}
      />
    </View>
  );
}
