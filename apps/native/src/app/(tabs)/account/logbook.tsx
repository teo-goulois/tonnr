import type { Session } from "@repo/client/viewer/types";
import { LogbookIcon, PlusIcon } from "@repo/ui/icon";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { byMonth, MonthGroup, Recap } from "@/components/sessions/logbook";
import { useSessionLog, useSessionWrites } from "@/components/sessions/use-sessions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** The header's "+", which begins a session and asks where. */
function AddButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.session_add()}
      onPress={() => router.push("/session/new")}
      hitSlop={4}
      style={({ pressed }) => ({
        width: TARGET,
        height: TARGET,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Glyph icon={PlusIcon} size={20} color={colors["neutral-10"]} />
    </Pressable>
  );
}

function LogSkeleton() {
  const { space } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.l, padding: space.m }}>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          <View style={{ flex: 1 }}>
            <Skeleton height={92} />
          </View>
          <View style={{ flex: 1 }}>
            <Skeleton height={92} />
          </View>
        </View>
        <Skeleton height={20} width="40%" />
        <Skeleton height={168} />
      </View>
    </Loading>
  );
}

/**
 * The account's log of its sessions, one step into the account's tab: what it comes to this month
 * and this year, the places it surfs most, then every session month by month, each opening its
 * sheet, swiped to be deleted, pulled down to be read again. The web's `LogbookPanel` shows the
 * same. Decision 043.
 */
export default function Logbook() {
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const { signedIn, pending } = useAccount();
  const { log, recap, media } = useSessionLog();
  const writes = useSessionWrites();
  const [now, setNow] = useState(Date.now);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const months = useMemo(() => byMonth(log.data ?? []), [log.data]);

  async function refresh() {
    setIsRefreshing(true);
    setNow(Date.now());
    await Promise.all([
      log.refetch(),
      recap.refetch(),
      queryClient.invalidateQueries({ queryKey: orpc.v1.media.sessions.key() }),
    ]).finally(() => setIsRefreshing(false));
  }

  const header = (
    <Stack.Screen
      options={{
        title: m.sessions_title(),
        headerRight: signedIn ? () => <AddButton /> : undefined,
      }}
    />
  );
  const ground = { flex: 1, backgroundColor: colors["cte-canvas"] };

  if (!signedIn) {
    return (
      <View style={ground}>
        {header}
        {pending ? (
          <LogSkeleton />
        ) : (
          <EmptyState
            icon={LogbookIcon}
            title={m.auth_reason_add_session()}
            description={m.session_sign_in_prompt()}
            action={{
              label: m.auth_sign_in(),
              onPress: () =>
                router.push({
                  pathname: "/sign-in",
                  params: { reason: m.auth_reason_add_session(), next: "/account/logbook" },
                }),
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={ground}>
      {header}
      <FlatList
        data={months}
        keyExtractor={(month) => month.name}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: space.l, padding: space.m, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void refresh()}
            tintColor={colors["neutral-7"]}
          />
        }
        ListHeaderComponent={
          log.data && log.data.length > 0 ? (
            <View style={{ gap: space.l }}>
              {recap.data ? <Recap recap={recap.data} /> : null}
              <Button
                variant="secondary"
                icon={PlusIcon}
                onPress={() => router.push("/session/new")}
                style={{ alignSelf: "flex-start" }}
              >
                {m.session_add()}
              </Button>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          log.isError ? (
            <ErrorState
              title={m.sessions_load_failed()}
              onRetry={() => void log.refetch()}
              retrying={log.isFetching}
            />
          ) : !log.data ? (
            <LogSkeleton />
          ) : (
            <EmptyState
              icon={LogbookIcon}
              title={m.sessions_title()}
              description={m.sessions_empty()}
              action={{ label: m.session_add(), onPress: () => router.push("/session/new") }}
            />
          )
        }
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
