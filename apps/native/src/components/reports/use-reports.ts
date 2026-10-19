import type { FlagReason, Report, ReportDraft } from "@repo/client/reports/types";
import type { Upload } from "@repo/client/sessions/types";
import { REPORT_TERMS } from "@repo/config/media";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
} from "expo-location";
import { useState } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { forgetSent } from "@/lib/uploads";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// The reports of the waves at a break, as the screens of the app read and send them: decisions
// 067 and 068. The web's `-reports.ts` asks the same of the API.

// How often the reports are asked again while one of the reader's is being checked.
const CHECKING_EVERY_MS = 4000;
/**
 * How far from its break a photo of a report may be taken, which the API judges: the app only
 * warns before sending. The rule is `REPORT_RADIUS_KM` of packages/media/src/report-checks.ts,
 * which the app may not import (decision 069).
 */
export const REPORT_RADIUS_KM = 2;

// Whether one of the reader's reports is still being checked.
const isChecking = (reports: readonly Report[] | undefined) =>
  reports?.some((report) => report.mine && report.state === "checking") ?? false;

/**
 * The query of a break's reports. What an account reads of its own reports, their counts among
 * it, is kept under that account: decision 068.
 */
export function reportsQuery(breakId: string, account: string | undefined) {
  return orpc.v1.reports.list.queryOptions({
    input: { breakId },
    queryKey: [...orpc.v1.reports.list.queryKey({ input: { breakId } }), account],
    refetchInterval: (query) => (isChecking(query.state.data?.reports) ? CHECKING_EVERY_MS : false),
    retry: false,
  });
}

/** The reports of the last week at a break, the latest first, and whether the instance takes any. */
export function useBreakReports(breakId: string | undefined) {
  const { userId } = useAccount();
  return useQuery({ ...reportsQuery(breakId ?? "", userId), enabled: breakId !== undefined });
}

/** Where the phone stands, and how precisely, as `reports.create` takes it. */
export type PhonePosition = { latitude: number; longitude: number; accuracyM: number | null };

/** Whether the phone may say where it stands: allowed, refused, or not asked yet. */
export async function positionAllowed(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await getForegroundPermissionsAsync();
    return status;
  } catch {
    return "denied";
  }
}

/**
 * Where the phone stands, asking leave first when it was never asked. Null when it will not say,
 * or says nothing in ten seconds: a report is sent all the same, and a photo whose file says where
 * it was taken still passes.
 */
export async function whereThePhoneIs(ask: boolean): Promise<PhonePosition | null> {
  try {
    let { status, canAskAgain } = await getForegroundPermissionsAsync();
    if (status !== "granted" && ask && canAskAgain) {
      ({ status } = await requestForegroundPermissionsAsync());
    }
    if (status !== "granted") return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
    const fresh = getCurrentPositionAsync({ accuracy: Accuracy.High }).catch(() => null);
    const found =
      (await Promise.race([fresh, timeout])) ??
      (await getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null));
    if (!found) return null;
    const { latitude, longitude, accuracy } = found.coords;
    return {
      latitude,
      longitude,
      accuracyM: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
    };
  } catch {
    return null;
  }
}

/** Why a report was not taken, in the reader's words. */
function refusalOf(error: unknown) {
  const refused = error as { code?: string; data?: { username?: string; reports?: string } };
  if (refused.code === "FORBIDDEN" && refused.data?.username === "missing") {
    return m.report_needs_username();
  }
  if (refused.code === "TOO_MANY_REQUESTS") {
    return refused.data?.reports === "here" ? m.report_one_an_hour() : m.report_ten_a_day();
  }
  if (refused.code === "CONFLICT") return m.report_not_sent_yet();
  return m.report_send_failed();
}

/** What sends, deletes and flags a report, each telling what it came to. */
export function useReportWrites() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const create = useMutation(orpc.v1.reports.create.mutationOptions());
  const remove = useMutation(orpc.v1.reports.delete.mutationOptions());
  const flag = useMutation(orpc.v1.reports.flag.mutationOptions());
  // From the press to the answer, the phone's position asked for first: the form waits.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.v1.reports.key() });

  return {
    isSending: isSubmitting || create.isPending,
    /** Sends a report at a break: asks the phone where it stands first. Answers whether it was taken. */
    send: async (breakId: string, draft: ReportDraft, uploads: ReadonlyMap<string, Upload>) => {
      if (isSubmitting) return false;
      const mediaIds = draft.uploads.flatMap((key) => {
        const upload = uploads.get(key);
        return upload?.state === "sent" && upload.id ? [upload.id] : [];
      });
      if (mediaIds.length === 0) return false;
      setIsSubmitting(true);
      try {
        // Where the phone stands places a photo whose file says nothing of where it was taken.
        const device = await whereThePhoneIs(true);
        await create.mutateAsync({
          breakId,
          mediaIds,
          ...(draft.waveSize && { waveSize: draft.waveSize }),
          ...(draft.setSize && { setSize: draft.setSize }),
          ...(draft.note.trim() && { note: draft.note.trim() }),
          ...(device && { device }),
          // What is added to the phone's local time to make UTC, as a browser says it.
          offsetMinutes: new Date().getTimezoneOffset(),
          terms: REPORT_TERMS,
        });
        forgetSent(draft.uploads);
        void refresh();
        tell({ title: m.report_sent(), tone: "success" });
        return true;
      } catch (error) {
        tell({ title: refusalOf(error), tone: "danger" });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    remove: async (report: Report) => {
      try {
        await remove.mutateAsync({ id: report.id });
        void refresh();
        tell({ title: m.report_deleted(), tone: "success" });
        return true;
      } catch {
        tell({ title: m.report_delete_failed(), tone: "danger" });
        return false;
      }
    },
    flag: async (report: Report, reason: FlagReason) => {
      try {
        await flag.mutateAsync({ id: report.id, reason });
        void refresh();
        tell({ title: m.report_flagged(), tone: "success" });
        return true;
      } catch (error) {
        const refused = error as { code?: string };
        tell({
          title: refused.code === "FORBIDDEN" ? m.report_flag_young() : m.report_flag_failed(),
          tone: "danger",
        });
        return false;
      }
    },
  };
}
