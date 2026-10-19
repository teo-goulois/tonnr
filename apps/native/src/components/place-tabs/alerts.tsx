import { BellIcon, PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { View } from "react-native";

import { AlertRow } from "@/components/alerts/alert-row";
import { GroupedCell } from "@/components/alerts/grouped";
import { useAlertActions, useAlerts } from "@/components/alerts/use-alerts";
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
 * none. Decisions 031 and 064.
 */
export function AlertsTab({ kind, id }: PlaceTabProps) {
  const { space } = useTheme();
  const { signedIn, pending } = useAccount();
  const requireAccount = useRequireAccount();
  const { alerts, isPending, isError, refetch } = useAlerts();
  const actions = useAlertActions();
  if (kind === "station") return null;

  const here = alerts?.filter((alert) =>
    (kind === "spot" ? alert.spotIds : alert.breakIds).includes(id),
  );
  // A visitor signs in first, and goes on to the alert once in.
  const newHere = () =>
    requireAccount(
      m.alerts_sign_in_prompt(),
      () => router.push({ pathname: "/alert/new", params: { place: `${kind}:${id}` } }),
      `/alert/new?place=${kind}:${id}`,
    );

  if (!signedIn && !pending) {
    return (
      <EmptyState
        icon={BellIcon}
        title={m.alert_offer()}
        description={m.alerts_sign_in_prompt()}
        action={{ label: m.alert_create(), onPress: newHere }}
      />
    );
  }
  if (pending || isPending) {
    return (
      <View style={{ paddingVertical: space.s }}>
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
      </View>
    );
  }
  if (isError) return <ErrorState title={m.alerts_mine_load_failed()} onRetry={refetch} />;
  if (!here?.length) {
    return (
      <EmptyState
        icon={BellIcon}
        title={m.alert_none()}
        action={{ label: m.alert_create(), onPress: newHere }}
      />
    );
  }

  return (
    <View style={{ gap: space.m, paddingVertical: space.s }}>
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
