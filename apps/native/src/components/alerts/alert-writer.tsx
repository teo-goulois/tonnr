import type { AlertDraft } from "@repo/client/alerts/alert-words";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { currentMapState } from "@/components/map/map-state";
import { middleOf } from "@/components/map/view";
import { placeOfParam } from "@/components/sessions/session-logic";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
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
// alert of the account, by its id. Each waits under the drawer's real head, drawn as the web's
// sheet waits, for what the editor reads: the account's spots, its alerts and its settings,
// which say whether a new alert asks about mail. A visitor is asked for an account in the
// web's words. Decisions 031 and 064.

/** Leaves the sheet: back, or to the map for a sheet with nothing under it. */
const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

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

/** The sheet with the drawer's head, and what stands under it until the editor can. */
function Sheet({
  title,
  description,
  children,
}: {
  /** Null while it is read: a line pulses in its place. */
  title: string | null;
  description?: string | null | undefined;
  children: ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <PanelHeader title={title} description={description} onClose={leave} />
      <View style={{ padding: space.m }}>{children}</View>
    </View>
  );
}

/** The sheet as the web's waits, while what it writes is read: a field, then the sentence. */
function Waiting({
  title,
  description,
}: {
  title: string | null;
  description?: string | null | undefined;
}) {
  const { space, type } = useTheme();
  return (
    <Sheet title={title} description={description}>
      <Loading>
        <View style={{ gap: space.s }}>
          <Skeleton height={type.m.line + 2 * space.xs} />
          <Skeleton width="80%" height={type.l.line} />
          <Skeleton width="60%" height={type.l.line} />
        </View>
      </Loading>
    </Sheet>
  );
}

/** What could not be read, in the web's muted line, with what asks again. */
function Failed({
  title,
  description,
  text,
  onRetry,
}: {
  title: string;
  description?: string | undefined;
  text: string;
  onRetry: () => void;
}) {
  const { space } = useTheme();
  return (
    <Sheet title={title} description={description}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{ alignItems: "flex-start", gap: space.s }}
      >
        <Text size="s" tone="muted">
          {text}
        </Text>
        <Button variant="secondary" onPress={onRetry}>
          {m.action_retry()}
        </Button>
      </View>
    </Sheet>
  );
}

/** A new alert: at a place, from a copy, or where the person says first. */
export function NewAlert({ placeParam, copyKey }: { placeParam?: string; copyKey?: string }) {
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
  // What is near the middle of the map comes first in the search, from where the map was as the
  // sheet opened, as the web's search ranks it.
  const near = useMemo(() => {
    const state = currentMapState();
    return (
      middleOf(state.bounds) ?? {
        latitude: state.center[1],
        longitude: state.center[0],
        zoom: Math.round(state.zoom),
      }
    );
  }, []);

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

  // A visitor is asked for an account as the web asks it, under the sheet's head: once signed
  // in, the sign-in sheet closes onto this one, which writes the alert.
  if (!signedIn && !pending) {
    return (
      <Sheet title={m.alert_new()}>
        <AccountPrompt text={m.auth_reason_add_alert()} />
      </Sheet>
    );
  }
  // A spot that is no longer the account's is no place to write from: where is asked instead.
  const isMissing =
    asked?.kind === "spot" &&
    spots.data !== undefined &&
    !spots.data.some((one) => one.id === asked.id);
  // Asked where first: the account's spots, the breaks looked at last, a search.
  if (!copy && !picked && (!asked || isMissing)) {
    return <PlacePicker near={near} onPick={setPicked} onClose={leave} />;
  }
  if (spots.isError || alerts.isError || settings.isError || surfBreak.isError) {
    return (
      <Failed
        title={m.alert_new()}
        description={place?.name}
        text={
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
  if (!place || !spots.data || !alerts.data || !settings.data) {
    return <Waiting title={m.alert_new()} description={place?.name ?? null} />;
  }
  return (
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
  );
}

/** An alert of the account, to change, switch off, copy or delete. */
export function SavedAlert({ id }: { id: string }) {
  const { signedIn, pending } = useAccount();
  const now = useNow();
  const alerts = useAllAlerts();
  const spots = useSpots();
  const settings = useAlertSettings();
  const alert = alerts.data?.find((one) => one.id === id);
  // An alert deleted, here or elsewhere, is no longer written: the sheet closes, once, as the
  // web's does. Its editor is gone by then, and with it the question before leaving.
  const isGone = alerts.data !== undefined && !alert;
  const closed = useRef(false);
  useEffect(() => {
    if (!isGone || closed.current) return;
    closed.current = true;
    leave();
  }, [isGone]);

  if (!signedIn && !pending) {
    return (
      <Sheet title={m.alerts_tab_mine()}>
        <AccountPrompt text={m.alerts_sign_in_prompt()} />
      </Sheet>
    );
  }
  const place = alert ? placesOfAlert(alert)[0] : undefined;
  if (alerts.isError || spots.isError) {
    return (
      <Failed
        title={alert?.name ?? m.alerts_tab_mine()}
        description={place?.name}
        text={m.alerts_mine_load_failed()}
        onRetry={() => {
          void alerts.refetch();
          void spots.refetch();
        }}
      />
    );
  }
  // An alert that is saved is no new one: its name and its place pulse while they are read.
  if (!alert || !place || !spots.data) {
    return <Waiting title={alert?.name ?? null} description={place?.name ?? null} />;
  }
  return (
    <AlertEditor
      key={alert.id}
      now={now}
      place={place}
      spots={spots.data}
      alert={alert}
      settings={settings.data}
    />
  );
}
