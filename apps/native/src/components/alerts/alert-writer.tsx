import type { AlertDraft } from "@repo/client/alerts/alert-words";
import { BellIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SheetHeader } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { useTell } from "@/components/ui/toast";
import { placeOfParam } from "@/components/sessions/session-logic";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { AlertEditor } from "./alert-editor";
import { type AlertPlace, placesOfAlert, readCopy } from "./copies";
import { PlacePicker } from "./place-picker";
import { useAlertSettings, useSpots } from "./use-alert-editor";

// The two screens an alert is written on, as the web's `AlertSheet` holds its editor: a new
// alert, at `?place=<break|spot>:<id>`, from a copy at `?copy=`, or asking where first; and an
// alert of the account, by its id. Each waits, drawn as it will stand, for what the editor reads:
// the account's spots, its alerts and its settings, which say whether a new alert asks about
// mail. Decisions 031 and 064.

/** The account's alerts as the API answered them, with those that wait for an undo. */
function useAllAlerts() {
  const { signedIn } = useAccount();
  return useQuery(
    orpc.v1.alerts.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.alerts,
      meta: { quiet: true },
    }),
  );
}

/** The sheet as it will stand, while what it writes is read. */
function Waiting() {
  const { colors, space } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <SheetHeader title={m.alert_new()} onCancel={() => router.back()} />
      <Loading>
        <View style={{ gap: space.m, padding: space.m }}>
          <Skeleton width="35%" height={13} />
          <Skeleton height={44} />
          <Skeleton width="55%" height={23} />
          <Skeleton width="90%" height={31} />
          <Skeleton width="75%" height={31} />
          <Skeleton width="60%" height={31} />
          <Skeleton height={60} />
        </View>
      </Loading>
    </View>
  );
}

/** What the sheet says to a visitor: an alert is an account's. */
function SignInFirst({ next }: { next: Href }) {
  const { colors } = useTheme();
  const requireAccount = useRequireAccount();
  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <SheetHeader title={m.alert_new()} onCancel={() => router.back()} />
      <EmptyState
        icon={BellIcon}
        title={m.alert_offer()}
        description={m.alerts_sign_in_prompt()}
        action={{
          label: m.auth_sign_in(),
          onPress: () => requireAccount(m.alerts_sign_in_prompt(), () => {}, next),
        }}
      />
    </View>
  );
}

function Failed({ title, onRetry }: { title: string; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <SheetHeader title={m.alert_new()} onCancel={() => router.back()} />
      <ErrorState title={title} onRetry={onRetry} />
    </View>
  );
}

/** A new alert: at a place, from a copy, or where the person says first. */
export function NewAlert({ placeParam, copyKey }: { placeParam?: string; copyKey?: string }) {
  const { colors } = useTheme();
  const { signedIn, pending } = useAccount();
  const now = useNow();
  const copy = readCopy(copyKey);
  const asked = copy ? undefined : (placeOfParam(placeParam) ?? undefined);
  const [picked, setPicked] = useState<AlertPlace>();
  const spots = useSpots();
  const settings = useAlertSettings();
  const alerts = useAllAlerts();
  // A break is named by the catalogue, a spot by the account's list.
  const surfBreak = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: asked?.id ?? "" },
      enabled: signedIn && asked?.kind === "break",
      meta: { quiet: true },
    }),
  );
  const place = useMemo<AlertPlace | undefined>(() => {
    if (copy) return copy.places[0];
    if (picked) return picked;
    if (asked?.kind === "break" && surfBreak.data) {
      const { id, name, latitude, longitude } = surfBreak.data;
      return { kind: "break", id, name, latitude, longitude };
    }
    if (asked?.kind === "spot") {
      const spot = spots.data?.find((one) => one.id === asked.id);
      if (spot) {
        return {
          kind: "spot",
          id: spot.id,
          name: spot.name,
          latitude: spot.latitude,
          longitude: spot.longitude,
        };
      }
    }
    return undefined;
  }, [copy, picked, asked?.kind, asked?.id, surfBreak.data, spots.data]);

  // A place that has alerts already takes another named after it and its rank, said whole.
  const count = place
    ? (alerts.data?.filter((one) =>
        (place.kind === "spot" ? one.spotIds : one.breakIds).includes(place.id),
      ).length ?? 0)
    : 0;
  const initial = useMemo<AlertDraft | undefined>(() => {
    if (copy) return copy.draft;
    if (!place || count === 0) return undefined;
    return {
      name: m.alert_name_another({ spot: place.name, count: count + 1 }),
      criteria: {},
      enabled: true,
      shortestMinutes: 120,
      spotIds: place.kind === "spot" ? [place.id] : [],
      breakIds: place.kind === "break" ? [place.id] : [],
    };
    // The count is read once the alerts are known, as the alert is begun: one saved meanwhile
    // renames nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy, place?.kind, place?.id, alerts.data !== undefined]);

  if (!signedIn && !pending) {
    return <SignInFirst next={placeParam ? `/alert/new?place=${placeParam}` : "/alert/new"} />;
  }
  // A spot that is no longer the account's is no place to write from: where is asked instead.
  const isMissing =
    asked?.kind === "spot" &&
    spots.data !== undefined &&
    !spots.data.some((one) => one.id === asked.id);
  // Asked where first: the account's spots, the breaks looked at last, a search.
  if (!copy && !picked && (!asked || isMissing)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
        <PlacePicker
          mode="one"
          onPick={setPicked}
          header={<SheetHeader title={m.create_alert_spot()} onCancel={() => router.back()} />}
        />
      </View>
    );
  }
  if (spots.isError || alerts.isError || settings.isError || surfBreak.isError) {
    return (
      <Failed
        title={
          surfBreak.isError
            ? m.native_alert_place_unread()
            : settings.isError
              ? m.alert_settings_load_failed()
              : m.alerts_mine_load_failed()
        }
        onRetry={() => {
          void spots.refetch();
          void alerts.refetch();
          void settings.refetch();
          if (asked?.kind === "break") void surfBreak.refetch();
        }}
      />
    );
  }
  if (!place || !spots.data || !alerts.data || !settings.data) return <Waiting />;
  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <AlertEditor
        key={`${place.kind}:${place.id}`}
        now={now}
        place={place}
        spots={spots.data}
        alert={undefined}
        initial={initial}
        initialPlaces={copy?.places}
        settings={settings.data}
      />
    </View>
  );
}

/** An alert of the account, to change, switch off, pause, copy or delete. */
export function SavedAlert({ id }: { id: string }) {
  const { colors } = useTheme();
  const { signedIn, pending } = useAccount();
  const now = useNow();
  const tell = useTell();
  const alerts = useAllAlerts();
  const spots = useSpots();
  const settings = useAlertSettings();
  const alert = alerts.data?.find((one) => one.id === id);
  // An alert deleted elsewhere is no longer written: the sheet says so and closes, once.
  const isGone = alerts.data !== undefined && !alert;
  const told = useRef(false);
  useEffect(() => {
    if (!isGone || told.current) return;
    told.current = true;
    tell({ title: m.alert_refused_gone(), tone: "danger" });
    if (router.canGoBack()) router.back();
  }, [isGone, tell]);

  if (!signedIn && !pending) return <SignInFirst next={`/alert/${id}`} />;
  if (alerts.isError || spots.isError) {
    return (
      <Failed
        title={m.alerts_mine_load_failed()}
        onRetry={() => {
          void alerts.refetch();
          void spots.refetch();
        }}
      />
    );
  }
  const place = alert ? placesOfAlert(alert)[0] : undefined;
  if (!alert || !place || !spots.data) return <Waiting />;
  return (
    <View style={{ flex: 1, backgroundColor: colors["cte-canvas"] }}>
      <AlertEditor
        key={alert.id}
        now={now}
        place={place}
        spots={spots.data}
        alert={alert}
        settings={settings.data}
      />
    </View>
  );
}
