import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { AlertDraft, AlertTrial } from "@/components/alerts/alert-words";
import type { AlertSettingsChange } from "@/components/alerts/alert-settings";
import type { Alerting } from "@/components/alerts/types";
import type { Alert, AlertSettings, Loadable } from "@/components/viewer/types";
import { hasUnsaved, leaveWith } from "@/lib/unsaved";
import { writesInTurn } from "@/lib/writes-in-turn";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

// How long the conditions must stay as they are before they are tried: a slider that moves
// asks nothing.
const TRIAL_WAIT_MS = 300;
const MINUTE_MS = 60 * 1000;

function loadable<Data>(query: {
  data: Data | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}): Loadable<Data> {
  const code = (query.error as { code?: unknown } | null)?.code;
  return {
    data: query.data,
    isPending: query.isLoading,
    isError: query.isError,
    isUnavailable: query.isError && code !== "NOT_FOUND",
  };
}

// What a refusal of the API says to the user, in their language. The API's own words are
// English, and name ids.
function refusalOf(error: unknown, otherwise: string) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "FORBIDDEN") return m.alert_refused_full();
  if (code === "NOT_FOUND") return m.alert_refused_gone();
  return otherwise;
}

// The panel that holds the editor of an alert, as an address names it: a spot's, unless a
// station or a break takes its place, in the map of the account or in that of a shared list.
// Whatever opens over it, a buoy, the bell, the saved lists, leaves it where it is.
function editorAt(search: unknown) {
  const at = search as { station?: string; break?: string; spot?: string; shared?: string };
  return at.station || at.break || !at.spot ? undefined : `${at.shared ?? ""}:${at.spot}`;
}

const sameSpots = (one: string[], other: string[]) =>
  one.length === other.length && one.every((id, index) => id === other[index]);

/**
 * The alerts of the account that is signed in, its settings, and what the screens do with them:
 * decision 031. `isShown` is true while a screen that reads the settings is open.
 */
export function useAlerting({ signedIn, isShown }: { signedIn: boolean; isShown: boolean }) {
  const queryClient = useQueryClient();
  const deviceZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const alertsKey = orpc.v1.alerts.list.queryKey();
  const alerts = useQuery(
    orpc.v1.alerts.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.alerts,
      meta: { quiet: true },
    }),
  );
  const settingsOptions = orpc.v1.alerts.getSettings.queryOptions({ meta: { quiet: true } });
  const settings = useQuery({ ...settingsOptions, enabled: signedIn && isShown });

  // The alert that is being written, and what is asked of it once it has stopped changing.
  const [trial, setTrial] = useState<AlertTrial>(null);
  const [tried, setTried] = useState<AlertTrial>(null);
  useEffect(() => {
    if (trial === null) {
      setTried(null);
      return;
    }
    const timer = setTimeout(() => setTried(trial), TRIAL_WAIT_MS);
    return () => clearTimeout(timer);
  }, [trial]);
  const canTry = signedIn && tried !== null && Object.keys(tried.criteria).length > 0;
  const triedSpots = tried?.spotIds ?? [];
  const preview = useQuery(
    orpc.v1.alerts.preview.queryOptions({
      input: {
        spotIds: triedSpots,
        criteria: tried?.criteria ?? {},
        shortestMinutes: tried?.shortestMinutes ?? 120,
        days: 7,
      },
      enabled: canTry,
      // What the conditions gave stays while they are tried again, so the strip does not blink:
      // at the same spots only. Another spot's sea is never shown under this one's sentence.
      placeholderData: (previous) =>
        previous &&
        sameSpots(
          previous.spots.map((one) => one.spotId),
          triedSpots,
        )
          ? previous
          : undefined,
      staleTime: 5 * MINUTE_MS,
      retry: false,
      meta: { quiet: true },
    }),
  );

  // An alert changes what its spots say of themselves: both lists are asked for again.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: alertsKey });
    void queryClient.invalidateQueries({ queryKey: orpc.v1.spots.key() });
  };

  // The settings are written one after the other, so that their answers come in the order they
  // were asked. What is on its way is laid over what the API last said, until the last write
  // has answered: a control never goes back to what an older answer says.
  const write = useMutation(orpc.v1.alerts.updateSettings.mutationOptions());
  const [pending, setPending] = useState<AlertSettingsChange>({});
  // Every write offers the time zone and the language of this device, which the API gives to an
  // account that has none and to no other: decision 031.
  const device = { zoneIfNone: deviceZone, localeIfNone: getLocale() };
  const writeOne = async (change: AlertSettingsChange) => {
    const saved = await write.mutateAsync({ ...change, ...device });
    // A read that was on its way would bring back the settings as they were before this.
    await queryClient.cancelQueries({ queryKey: settingsOptions.queryKey });
    queryClient.setQueryData(settingsOptions.queryKey, saved);
  };
  const allSettled = (failed: boolean) => {
    // The last write has answered: the screen shows what the API holds.
    setPending({});
    if (failed) {
      toast.error(m.alert_settings_save_failed());
      void queryClient.invalidateQueries({ queryKey: settingsOptions.queryKey });
    }
    // The hours an account can use have changed: what was tried is tried again.
    void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.preview.key() });
  };
  // The queue lives as long as the screen, and always calls what this render made.
  const latest = useRef({ writeOne, allSettled });
  latest.current = { writeOne, allSettled };
  const [send] = useState(() =>
    writesInTurn<AlertSettingsChange>(
      (change) => latest.current.writeOne(change),
      (failed) => latest.current.allSettled(failed),
    ),
  );
  const changeSettings = useCallback(
    (change: AlertSettingsChange) => {
      setPending((current) => ({ ...current, ...change }));
      send(change);
    },
    [send],
  );
  const shownSettings = useMemo<Loadable<AlertSettings>>(() => {
    const read = loadable(settings);
    return read.data ? { ...read, data: { ...read.data, ...pending } } : read;
  }, [settings, pending]);

  // What is written of an alert and not saved is not lost without a word: whatever leaves the
  // panel it is written in waits for an answer. The panel closed, another selection, a link and
  // the browser's own way back are all one thing to the router. `lib/unsaved` holds the
  // question, and answers it "stay" when it no longer stands.
  const router = useRouter();
  useBlocker({
    shouldBlockFn: ({ current, next, action }) => {
      if (!hasUnsaved()) return false;
      if (current.pathname === next.pathname && editorAt(current.search) === editorAt(next.search))
        return false;
      if (action === "PUSH" || action === "REPLACE") {
        // Nothing has moved yet: the navigation waits for the answer.
        return new Promise<boolean>((resolve) => {
          leaveWith(
            () => resolve(false),
            () => resolve(true),
          );
        });
      }
      // The browser's own way back or forward has moved already. It is brought back at once,
      // and done again when the answer is to leave: a traversal that waited for an answer
      // would be undone from wherever a second one had taken the browser meanwhile.
      const address = window.location.href;
      leaveWith(() => {
        if (action === "BACK") router.history.back({ ignoreBlocker: true });
        else if (action === "FORWARD") router.history.forward({ ignoreBlocker: true });
        // Several steps at once: their address is gone to, as a link to it would.
        else router.history.push(address, undefined, { ignoreBlocker: true });
      });
      return true;
    },
    enableBeforeUnload: hasUnsaved,
  });

  const create = useMutation(orpc.v1.alerts.create.mutationOptions());
  const update = useMutation(orpc.v1.alerts.update.mutationOptions());
  const remove = useMutation(orpc.v1.alerts.delete.mutationOptions());
  // The switch of the list is saved apart from the editor: neither waits for the other.
  const turn = useMutation(orpc.v1.alerts.update.mutationOptions());

  // Each request answers for itself: its promise settles whatever was asked after it.
  const save = (
    alert: Alert | undefined,
    draft: AlertDraft,
    changed: Partial<AlertDraft>,
    byMail?: boolean,
  ) => {
    const asked = alert
      ? update.mutateAsync({ id: alert.id, ...changed })
      : // The first alert sets the account's time zone, as its first setting does, and keeps
        // what the account answered about mail: both are saved with the alert, or not at all.
        create.mutateAsync({
          ...draft,
          ...device,
          ...(byMail === undefined ? {} : { byMailIfNone: byMail }),
        });
    return asked
      .then((saved) => {
        // The alert is in the list at once: its editor reads it there.
        queryClient.setQueryData(alertsKey, (answer) =>
          answer
            ? {
                alerts: [...answer.alerts.filter((one) => one.id !== saved.id), saved].sort(
                  (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
                ),
              }
            : answer,
        );
        toast.success(m.alert_saved({ name: saved.name }));
        if (!alert) void queryClient.invalidateQueries({ queryKey: settingsOptions.queryKey });
        return saved as Alert | undefined;
      })
      .catch((error: unknown) => {
        toast.error(refusalOf(error, m.alert_save_failed()));
        return undefined;
      })
      .finally(refresh);
  };

  // A switch waits for its answer before it moves again: the last press is the one that holds.
  const [switching, setSwitching] = useState<string[]>([]);
  const flip = (alert: Alert, enabled: boolean) => {
    if (switching.includes(alert.id)) return;
    setSwitching((ids) => [...ids, alert.id]);
    queryClient.setQueryData(alertsKey, (answer) =>
      answer
        ? { alerts: answer.alerts.map((one) => (one.id === alert.id ? { ...one, enabled } : one)) }
        : answer,
    );
    void turn
      .mutateAsync({ id: alert.id, enabled })
      .catch((error: unknown) => void toast.error(refusalOf(error, m.alert_save_failed())))
      .finally(() => {
        setSwitching((ids) => ids.filter((id) => id !== alert.id));
        refresh();
      });
  };
  const onTry = useCallback((next: AlertTrial) => setTrial(next), []);

  return {
    alerts: loadable(alerts),
    settings: shownSettings,
    deviceZone,
    // What the conditions give is on its way while they wait to be tried, and while they are.
    preview: {
      ...loadable(preview),
      isPending: trial !== null && (trial !== tried || (canTry && preview.isFetching)),
    },
    onTry,
    isSaving: create.isPending || update.isPending,
    onRetry: () => {
      void queryClient.invalidateQueries({ queryKey: alertsKey });
      void queryClient.invalidateQueries({ queryKey: settingsOptions.queryKey });
    },
    onSave: save,
    isDeleting: remove.isPending,
    onDelete: (alert) =>
      void remove
        .mutateAsync({ id: alert.id })
        .then(() => {
          queryClient.setQueryData(alertsKey, (answer) =>
            answer ? { alerts: answer.alerts.filter((one) => one.id !== alert.id) } : answer,
          );
          toast.success(m.alert_deleted({ name: alert.name }));
        })
        .catch((error: unknown) => void toast.error(refusalOf(error, m.alert_delete_failed())))
        .finally(refresh),
    switching,
    onSwitch: flip,
    onSettingsChange: changeSettings,
  } satisfies Alerting;
}
