import { BellIcon, PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { AlertRow } from "@/components/alerts/alert-row";
import { GroupedCell } from "@/components/alerts/grouped";
import { useAlertActions, useAlerts } from "@/components/alerts/use-alerts";
import { placeParam } from "@/components/sessions/session-logic";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/**
 * The alerts of the account at a place, a spot of its own or a surf break, as the web's
 * `SpotAlerts` lists them: each with what it asks, the other places it is set on, and its switch,
 * opening its editor, with the swipes and the long press of the alerts' tab; and a new alert
 * here. A place may have several, one for each kind of sea that makes it work. A station takes
 * none. The tab scrolls under the sheet's head, and is pulled to be read again, as the other tabs
 * of a place's sheet are. Decisions 031 and 064.
 */
export function AlertsTab({ kind, id }: PlaceTabProps) {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const requireAccount = useRequireAccount();
  const { alerts, isPending, isError, isRefreshing, refresh, refetch } = useAlerts();
  const actions = useAlertActions();
  if (kind === "station") return null;

  const here = alerts?.filter((alert) =>
    (kind === "spot" ? alert.spotIds : alert.breakIds).includes(id),
  );
  // A visitor signs in first, and goes on to the alert once in.
  const place = placeParam({ kind, id });
  const newHere = () =>
    requireAccount(
      m.alerts_sign_in_prompt(),
      () => router.push({ pathname: "/alert/new", params: { place } }),
      `/alert/new?place=${place}`,
    );

  let content: ReactNode;
  if (!signedIn && !pending) {
    content = (
      <EmptyState
        icon={BellIcon}
        title={m.alert_offer()}
        description={m.alerts_sign_in_prompt()}
        action={{ label: m.alert_create(), onPress: newHere }}
      />
    );
  } else if (pending || isPending) {
    content = (
      <Loading>
        {[0, 1].map((index) => (
          <GroupedCell key={index} first={index === 0} last={index === 1}>
            <View style={{ gap: space.xs, padding: space.m }}>
              <Skeleton width="40%" height={16} />
              <Skeleton width="75%" height={13} />
            </View>
          </GroupedCell>
        ))}
      </Loading>
    );
  } else if (isError) {
    content = <ErrorState title={m.alerts_mine_load_failed()} onRetry={refetch} />;
  } else if (!here?.length) {
    content = (
      <EmptyState
        icon={BellIcon}
        title={m.alert_none()}
        action={{ label: m.alert_create(), onPress: newHere }}
      />
    );
  } else {
    content = (
      <View style={{ gap: space.m }}>
        <View>
          {here.map((alert, index) => (
            <GroupedCell key={alert.id} first={index === 0} last={index === here.length - 1}>
              <AlertRow alert={alert} actions={actions} placeId={id} />
            </GroupedCell>
          ))}
        </View>
        <View style={{ paddingHorizontal: space.m, alignItems: "flex-start" }}>
          <Button variant="secondary" icon={PlusIcon} onPress={newHere}>
            {m.native_alert_new_here()}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      nestedScrollEnabled
      contentContainerStyle={{ paddingVertical: space.s, paddingBottom: space.xxl }}
      refreshControl={
        signedIn ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors["neutral-7"]}
          />
        ) : undefined
      }
    >
      {content}
    </ScrollView>
  );
}
