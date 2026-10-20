import type { Alert } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { feel } from "@/components/ui/haptics";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { keepCopy, placesOfAlert } from "./copies";
import { UNDO_MS, deleteLater, undoDelete, useDeleting } from "./deleting";

// The account's alerts and what the screens do with them, as the web's `useAlerting` does
// (apps/web/src/routes/app/-alerting.ts): read them, switch one, pause it for today (decision
// 072), delete it with an undo, and start another from a copy. Decision 031.

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a refusal of the API says to the person, in their language: its own words are English. */
export function refusalOf(error: unknown, otherwise: string) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "FORBIDDEN") return m.alert_refused_full();
  if (code === "NOT_FOUND") return m.alert_refused_gone();
  return otherwise;
}

/** The account's alerts, the oldest first, without those that wait for their undo to run out. */
export function useAlerts() {
  const { signedIn } = useAccount();
  const deleting = useDeleting();
  const query = useQuery(
    orpc.v1.alerts.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.alerts,
      meta: { quiet: true },
    }),
  );
  const alerts = useMemo(
    () => query.data?.filter((alert) => !deleting.has(alert.id)),
    [query.data, deleting],
  );
  // The list pulled down turns while it is read again, and only then: a switch or a delete asks
  // for it again too, under a list that stays still.
  const [isPulled, setPulled] = useState(false);
  return {
    alerts,
    // A visitor's list is never asked for, and is not pending.
    isPending: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    isRefreshing: isPulled,
    refresh: () => {
      setPulled(true);
      void query.refetch().finally(() => setPulled(false));
    },
  };
}

/** What a list does with an alert: its switch, its pause, deleting it and copying it. */
export function useAlertActions() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const listKey = orpc.v1.alerts.list.queryKey();

  // The alert as the API answered it takes its place in the list at once.
  const replace = (saved: Alert) =>
    queryClient.setQueryData(listKey, (answer) =>
      answer ? { alerts: answer.alerts.map((one) => (one.id === saved.id ? saved : one)) } : answer,
    );
  // An alert changes what its places say of themselves: both lists are asked for again.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: orpc.v1.spots.key() });
  };

  // The switch is saved apart from the editor: neither waits for the other. A switch waits for
  // its answer before it moves again: the last press is the one that holds.
  const turn = useMutation(orpc.v1.alerts.update.mutationOptions());
  const [switching, setSwitching] = useState<string[]>([]);
  const flip = (alert: Alert, enabled: boolean) => {
    if (switching.includes(alert.id)) return;
    setSwitching((ids) => [...ids, alert.id]);
    queryClient.setQueryData(listKey, (answer) =>
      answer
        ? { alerts: answer.alerts.map((one) => (one.id === alert.id ? { ...one, enabled } : one)) }
        : answer,
    );
    void turn
      .mutateAsync({ id: alert.id, enabled })
      .catch((error: unknown) =>
        tell({ title: refusalOf(error, m.alert_save_failed()), tone: "danger" }),
      )
      .finally(() => {
        setSwitching((ids) => ids.filter((id) => id !== alert.id));
        refresh();
      });
  };

  // "Not today", as the push of an alert offers it: the API ends the pause at the end of the
  // account's day by its own clock, and no later than what is given, which is a day from now so
  // that it is the API's day that counts. Decision 072.
  const pauseToday = useMutation(orpc.v1.alerts.pauseToday.mutationOptions());
  const lift = useMutation(orpc.v1.alerts.update.mutationOptions());
  const pause = (alert: Alert) =>
    pauseToday
      .mutateAsync({ id: alert.id, until: new Date(Date.now() + DAY_MS) })
      .then((saved) => {
        replace(saved);
        tell({ title: m.native_alert_paused_told({ name: alert.name }), tone: "success" });
      })
      .catch((error: unknown) =>
        tell({ title: refusalOf(error, m.native_alert_pause_failed()), tone: "danger" }),
      );
  const resume = (alert: Alert) =>
    lift
      .mutateAsync({ id: alert.id, awayUntil: null })
      .then((saved) => {
        replace(saved);
        tell({ title: m.native_alert_resumed_told({ name: alert.name }), tone: "success" });
      })
      .catch((error: unknown) =>
        tell({ title: refusalOf(error, m.alert_save_failed()), tone: "danger" }),
      );

  // Deleted at once from the lists, and for good once the toast's undo has run out.
  const remove = (alert: Alert) => {
    feel("warn");
    deleteLater(alert, () => tell({ title: m.alert_delete_failed(), tone: "danger" }));
    tell({
      title: m.alert_deleted({ name: alert.name }),
      action: { label: m.native_undo(), onPress: () => undoDelete(alert.id) },
      duration: UNDO_MS,
    });
  };

  // Another alert, from a copy of this one, in the sheet a new alert is written in.
  const duplicate = (alert: Alert) => {
    const key = keepCopy({
      draft: {
        name: m.alert_copy_name({ name: alert.name }),
        criteria: alert.criteria,
        enabled: true,
        shortestMinutes: alert.shortestMinutes,
        spotIds: alert.spotIds,
        breakIds: alert.breakIds,
      },
      places: placesOfAlert(alert),
    });
    router.push({ pathname: "/alert/new", params: { copy: key } });
  };

  return {
    switching,
    flip,
    pausing: pauseToday.isPending || lift.isPending,
    pause,
    resume,
    remove,
    duplicate,
    open: (alert: Alert) => router.push({ pathname: "/alert/[id]", params: { id: alert.id } }),
  };
}

export type AlertActions = ReturnType<typeof useAlertActions>;
