import type { AlertDraft } from "@repo/client/alerts/alert-words";
import { tideAhead } from "@repo/client/alerts/tide-band";
import type { Alert } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { phoneZone } from "@/components/account/use-alert-settings";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import type { AlertPlace } from "./copies";
import { refusalOf } from "./use-alerts";

// What the editor of an alert reads and asks for, as the web's `useAlerting` does it for its
// sheet (apps/web/src/routes/app/-alerting.ts): the account's spots and settings, what the
// places give over the week, the tide at the place, and saving. Decision 031.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// How long the places must stay as they are before they are tried: a spot pressed on and off
// asks nothing.
const TRIAL_WAIT_MS = 300;

/** The account's spots. */
export function useSpots() {
  const { signedIn } = useAccount();
  return useQuery(
    orpc.v1.spots.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.spots,
      meta: { quiet: true },
    }),
  );
}

/** The account's settings of the alerts: its zone, and whether it was asked about mail. */
export function useAlertSettings() {
  const { signedIn } = useAccount();
  return useQuery(
    orpc.v1.alerts.getSettings.queryOptions({ enabled: signedIn, meta: { quiet: true } }),
  );
}

const sameIds = (one: readonly string[], other: readonly string[]) =>
  one.length === other.length && one.every((id, index) => id === other[index]);

/**
 * Every figure of every hour ahead at the places, and the hours the account can use: the preview
 * is asked once for the places, with no condition and windows of an hour, and the editor judges
 * each change itself. It is asked again once the places have stopped changing.
 */
export function usePreview(spotIds: readonly string[], breakIds: readonly string[]) {
  const key = `${spotIds.join(",")}|${breakIds.join(",")}`;
  const latest = useRef({ spotIds, breakIds });
  latest.current = { spotIds, breakIds };
  const [tried, setTried] = useState<{ key: string; spotIds: string[]; breakIds: string[] }>();
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setTried({
          key,
          spotIds: [...latest.current.spotIds],
          breakIds: [...latest.current.breakIds],
        }),
      TRIAL_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [key]);
  const ids = [...(tried?.spotIds ?? []), ...(tried?.breakIds ?? [])];
  const canTry = ids.length > 0;
  const preview = useQuery(
    orpc.v1.alerts.preview.queryOptions({
      input: {
        spotIds: tried?.spotIds ?? [],
        breakIds: tried?.breakIds ?? [],
        criteria: {},
        shortestMinutes: 60,
        days: 7,
      },
      enabled: canTry,
      // What the places gave stays while they are tried again, so that the week does not
      // blink: at the same places only. Another place's sea is never shown under this sentence.
      placeholderData: (previous) =>
        previous &&
        sameIds(
          previous.spots.map((one) => one.spotId),
          ids,
        )
          ? previous
          : undefined,
      staleTime: 5 * MINUTE_MS,
      retry: false,
      meta: { quiet: true },
    }),
  );
  return {
    data: preview.data,
    isError: preview.isError,
    isPending: tried?.key !== key || (canTry && preview.isFetching),
  };
}

/**
 * The tide at a place over the two days ahead, with its turns from the day before to the days
 * after: how long the parts of the cycle asked last, and whether a coefficient can be asked
 * there. Read again every six hours.
 */
export function useTideAt(place: { latitude: number; longitude: number } | undefined, now: number) {
  const watch = Math.floor(now / (6 * HOUR_MS));
  const span = useMemo(() => {
    const start = new Date(watch * 6 * HOUR_MS - DAY_MS);
    start.setMinutes(0, 0, 0);
    return { start, end: new Date(start.getTime() + 4 * DAY_MS) };
  }, [watch]);
  const point = { latitude: place?.latitude ?? 0, longitude: place?.longitude ?? 0 };
  const quiet = { enabled: place !== undefined, retry: false, meta: { quiet: true } } as const;
  const timeline = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: { ...point, ...span, stepMinutes: 10 },
      ...quiet,
      staleTime: HOUR_MS,
    }),
  );
  const turns = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { ...point, ...span },
      ...quiet,
      staleTime: HOUR_MS,
    }),
  );
  const tide = useMemo(
    () =>
      tideAhead(
        (timeline.data?.timeline ?? []).map((entry) => ({
          time: entry.time,
          value: entry.heightMeters,
        })),
        now,
      ),
    [timeline.data, now],
  );
  const extremes = useMemo(() => turns.data?.extremes ?? [], [turns.data]);
  return {
    tide,
    extremes,
    // Far from every tide station the API answers that none is near.
    hasTide: !timeline.isError && (timeline.data?.timeline.length ?? 0) > 0,
    isPending: timeline.isLoading,
    station: timeline.data?.station,
    hasCoefficients: extremes.some((one) => one.coefficient != null),
  };
}

/**
 * Where the wind comes from when it blows straight off the shore at a place, where its words
 * say: the break's in the catalogue, a spot's in what its owner said of it.
 */
export function useOffshore(
  place: AlertPlace | undefined,
  spots:
    | { id: string; characteristics: { offshoreDirectionDegrees?: number | null } }[]
    | undefined,
) {
  const surfBreak = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: place?.id ?? "" },
      enabled: place?.kind === "break",
      staleTime: 10 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  if (!place) return null;
  if (place.kind === "break")
    return surfBreak.data?.characteristics.offshoreDirectionDegrees ?? null;
  return (
    spots?.find((one) => one.id === place.id)?.characteristics.offshoreDirectionDegrees ?? null
  );
}

/**
 * Saves an alert: a new one whole, with the zone and the language of this phone and what the
 * account answered about mail, or what of one was changed. Answers the alert as it is saved, or
 * nothing when it could not be, which the person is told.
 */
export function useSaveAlert() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const listKey = orpc.v1.alerts.list.queryKey();
  const create = useMutation(orpc.v1.alerts.create.mutationOptions());
  const update = useMutation(orpc.v1.alerts.update.mutationOptions());

  const save = (
    alert: Alert | undefined,
    draft: AlertDraft,
    changed: Partial<AlertDraft>,
    byMail?: boolean,
  ): Promise<Alert | undefined> => {
    const asked = alert
      ? update.mutateAsync({ id: alert.id, ...changed })
      : create.mutateAsync({
          ...draft,
          // The first alert sets the account's time zone and language, as its first setting
          // does, and keeps what the account answered about mail: all are saved with it or none.
          zoneIfNone: phoneZone(),
          localeIfNone: getLocale(),
          ...(byMail === undefined ? {} : { byMailIfNone: byMail }),
        });
    return asked
      .then((saved) => {
        // The alert is in the lists at once.
        queryClient.setQueryData(listKey, (answer) =>
          answer
            ? {
                alerts: [...answer.alerts.filter((one) => one.id !== saved.id), saved].sort(
                  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
                ),
              }
            : answer,
        );
        tell({ title: m.alert_saved({ name: saved.name }), tone: "success" });
        if (!alert) {
          void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.getSettings.queryKey() });
        }
        return saved as Alert | undefined;
      })
      .catch((error: unknown) => {
        tell({ title: refusalOf(error, m.alert_save_failed()), tone: "danger" });
        return undefined;
      })
      .finally(() => {
        // An alert changes what its places say of themselves: both lists are asked for again.
        void queryClient.invalidateQueries({ queryKey: listKey });
        void queryClient.invalidateQueries({ queryKey: orpc.v1.spots.key() });
      });
  };

  return { save, isSaving: create.isPending || update.isPending };
}

/**
 * Deletes an alert from its editor at once, as the web's does once asked, with no undo: the
 * question was the platform's, and the toast says it is done. The editor's screen closes once
 * the alert is gone from the list. A list's swipe deletes with an undo instead (`deleting.ts`).
 */
export function useDeleteAlert() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const listKey = orpc.v1.alerts.list.queryKey();
  const remove = useMutation(orpc.v1.alerts.delete.mutationOptions());

  const deleteNow = (alert: Alert) =>
    remove
      .mutateAsync({ id: alert.id })
      .then(() => {
        queryClient.setQueryData(listKey, (answer) =>
          answer ? { alerts: answer.alerts.filter((one) => one.id !== alert.id) } : answer,
        );
        tell({ title: m.alert_deleted({ name: alert.name }), tone: "success" });
      })
      .catch((error: unknown) =>
        tell({ title: refusalOf(error, m.alert_delete_failed()), tone: "danger" }),
      )
      .finally(() => {
        // An alert changes what its places say of themselves: both lists are asked for again.
        void queryClient.invalidateQueries({ queryKey: listKey });
        void queryClient.invalidateQueries({ queryKey: orpc.v1.spots.key() });
      });

  return { deleteNow, isDeleting: remove.isPending };
}
