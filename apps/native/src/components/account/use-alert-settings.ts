import type { AlertSettings } from "@repo/client/viewer/types";
import { writesInTurn } from "@repo/client/writes-in-turn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCalendars } from "expo-localization";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

/** What a control of the settings changes: one setting, as the API takes it. */
export type AlertSettingsChange = Partial<
  Pick<
    AlertSettings,
    | "onFound"
    | "onChange"
    | "onEvening"
    | "eveningMinutes"
    | "onBegin"
    | "onReports"
    | "noticeMinutes"
    | "quietFrom"
    | "quietTo"
    | "namesInSubject"
    | "horizonDays"
    | "daylightOnly"
    | "week"
    | "awayUntil"
  > & { zone: string; byMail: boolean }
>;

/** The time zone of this phone, which an account that has set none may take. */
export function phoneZone() {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

/**
 * How the account wants to be told, for all its alerts, and what changes it: decision 031, as
 * the web's `useAlerting` has it. Each control saves what it changes at once, one write after
 * the other, so that their answers come in the order they were asked; what is on its way is laid
 * over what the API last said until the last write has answered, so that a control never goes
 * back to an older answer. Every write offers the phone's time zone and language, which the API
 * gives an account that has none.
 */
export function useAlertSettings() {
  const { signedIn } = useAccount();
  const queryClient = useQueryClient();
  const tell = useTell();
  const options = orpc.v1.alerts.getSettings.queryOptions({ enabled: signedIn });
  const settings = useQuery(options);
  const write = useMutation(orpc.v1.alerts.updateSettings.mutationOptions());
  const [pending, setPending] = useState<AlertSettingsChange>({});
  const zone = phoneZone();

  const writeOne = async (change: AlertSettingsChange) => {
    const saved = await write.mutateAsync({
      ...change,
      zoneIfNone: zone,
      localeIfNone: getLocale(),
    });
    // A read that was on its way would bring back the settings as they were before this.
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    queryClient.setQueryData(options.queryKey, saved);
  };
  const allSettled = (failed: boolean) => {
    setPending({});
    if (failed) {
      tell({ title: m.alert_settings_save_failed(), tone: "danger" });
      void queryClient.invalidateQueries({ queryKey: options.queryKey });
    }
    // The hours an account can use have changed: what an editor tried is tried again.
    void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.preview.key() });
  };
  // The queue lives as long as the screen, and always calls what the last render made.
  const latest = useRef({ writeOne, allSettled });
  useEffect(() => {
    latest.current = { writeOne, allSettled };
  });
  const [send] = useState(() =>
    writesInTurn<AlertSettingsChange>(
      (change) => latest.current.writeOne(change),
      (failed) => latest.current.allSettled(failed),
    ),
  );

  const change = useCallback(
    (next: AlertSettingsChange) => {
      setPending((current) => ({ ...current, ...next }));
      send(next);
    },
    [send],
  );
  const shown = useMemo(
    () => (settings.data ? { ...settings.data, ...pending } : undefined),
    [settings.data, pending],
  );

  return {
    settings: shown,
    isPending: settings.isPending && signedIn,
    isError: settings.isError,
    isRefetching: settings.isRefetching,
    refetch: () => void settings.refetch(),
    phoneZone: zone,
    change,
  };
}
