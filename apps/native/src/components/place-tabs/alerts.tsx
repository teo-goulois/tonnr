import { PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { AlertRow } from "@/components/alerts/alert-row";
import { useAlertActions, useAlerts } from "@/components/alerts/use-alerts";
import { placeParam } from "@/components/sessions/session-logic";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { LinesLoading, TabFailure } from "./tab-states";
import { AccountPrompt } from "@/components/auth/account-prompt";

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
    // A visitor's sheet has no alerts' tab: this is seen for a moment, as an account signs out.
    content = <AccountPrompt text={m.alerts_sign_in_prompt()} />;
  } else if (pending || isPending) {
    // As the web's panel of a spot: two lines to come, and what failed in a line with a retry.
    content = <LinesLoading />;
  } else if (isError) {
    content = <TabFailure text={m.alerts_mine_load_failed()} onRetry={refetch} />;
  } else if (!here?.length) {
    content = (
      <View style={{ gap: space.s, alignItems: "flex-start" }}>
        <Text size="s" tone="muted">
          {m.alert_none()}
        </Text>
        <Button variant="secondary" onPress={newHere}>
          {m.alert_create()}
        </Button>
      </View>
    );
  } else {
    content = (
      <View style={{ gap: space.m, alignItems: "flex-start" }}>
        {/* The web's plain rows, a small step apart with no line between them, which run a
            small step past the panel so that their words line up with the rest. */}
        <View style={{ gap: space.xxs, marginHorizontal: -space.xs, alignSelf: "stretch" }}>
          {here.map((alert) => (
            <AlertRow key={alert.id} alert={alert} actions={actions} placeId={id} plain />
          ))}
        </View>
        <Button variant="secondary" icon={PlusIcon} onPress={newHere}>
          {m.alert_new()}
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      nestedScrollEnabled
      contentContainerStyle={{ padding: space.m, paddingBottom: space.xxl }}
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
