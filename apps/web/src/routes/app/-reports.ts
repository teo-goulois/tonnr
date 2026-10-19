import { REPORT_TERMS } from "@repo/config/media";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { Report, Reporting } from "@/components/reports/types";
import type { MediaStatus } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { dropUpload, forgetSent, retryUpload, startUploads, useUploads } from "./-media";

// The reports of the waves at a break, for its panel and the form one is sent from: decision 067.

// How often the reports are asked again while one of the reader's is being checked.
const CHECKING_EVERY_MS = 4000;

/** Where the phone stands, as precisely as it says, or null when it will not say. */
function whereThePhoneIs(): Promise<{
  latitude: number;
  longitude: number;
  accuracyM: number | null;
} | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
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

// A file of a report that is not sent belongs to nothing: it goes from the API too. One function
// for every render, which a form's cleanup may depend on.
const dropReportUpload = (key: string) => dropUpload(key, true);

// Whether one of the reader's reports is still being checked.
const isChecking = (reports: readonly Report[] | undefined) =>
  reports?.some((report) => report.mine && report.state === "checking") ?? false;

type Asked = {
  signedIn: boolean;
  // Who is signed in: what an account reads of its own reports, their counts among it, is kept
  // under it, as a session can become another account's in another tab. Decision 068.
  account: string | undefined;
  // The break whose panel is open.
  breakId: string | undefined;
  status: MediaStatus | undefined;
};

/** The reports of the break that is open, and the form that sends one. */
export function useReports({ signedIn, account, breakId, status }: Asked): Reporting {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<{ breakId: string; name: string } | null>(null);
  // From the press to the answer, the phone's position asked for first: the form waits.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const uploads = useUploads();

  const here = useQuery(
    orpc.v1.reports.list.queryOptions({
      input: { breakId: breakId ?? "" },
      queryKey: [...orpc.v1.reports.list.queryKey({ input: { breakId: breakId ?? "" } }), account],
      enabled: breakId !== undefined,
      refetchInterval: (query) =>
        isChecking(query.state.data?.reports) ? CHECKING_EVERY_MS : false,
      retry: false,
      meta: { quiet: true },
    }),
  );
  const create = useMutation(orpc.v1.reports.create.mutationOptions());
  const remove = useMutation(orpc.v1.reports.delete.mutationOptions());
  const flag = useMutation(orpc.v1.reports.flag.mutationOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.v1.reports.key() });

  const { data, isLoading, isError } = here;
  const reports = data?.reports;
  const loadable = useMemo(
    () => ({ data: reports, isPending: isLoading, isError }),
    [reports, isLoading, isError],
  );

  return {
    here: loadable,
    offered: data?.offered,
    status: signedIn ? status : undefined,
    open,
    onBegin: (place) => setOpen(place),
    onClose: () => setOpen(null),
    uploads,
    onStart: (files) => {
      const { started, refused } = startUploads(files, "report");
      for (const file of refused) {
        toast.error(
          file.why === "type"
            ? m.media_refused_type({ name: file.name })
            : m.media_refused_size({ name: file.name }),
        );
      }
      return started;
    },
    onRetry: retryUpload,
    onDrop: dropReportUpload,
    isSending: isSubmitting || create.isPending,
    onSend: async (draft) => {
      if (!open || isSubmitting) return false;
      const mediaIds = draft.uploads.flatMap((key) => {
        const upload = uploads.get(key);
        return upload?.state === "sent" && upload.id ? [upload.id] : [];
      });
      if (mediaIds.length === 0) return false;
      setIsSubmitting(true);
      try {
        // Where the phone stands places a photo whose file says nothing of where it was taken.
        const device = await whereThePhoneIs();
        await create.mutateAsync({
          breakId: open.breakId,
          mediaIds,
          ...(draft.waveSize && { waveSize: draft.waveSize }),
          ...(draft.setSize && { setSize: draft.setSize }),
          ...(draft.note.trim() && { note: draft.note.trim() }),
          ...(device && { device }),
          // What a browser says of its offset is what is added to its local time to make UTC.
          offsetMinutes: new Date().getTimezoneOffset(),
          terms: REPORT_TERMS,
        });
        forgetSent(draft.uploads);
        setOpen(null);
        void refresh();
        toast.success(m.report_sent());
        return true;
      } catch (error) {
        toast.error(refusalOf(error));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    onDelete: async (report) => {
      try {
        await remove.mutateAsync({ id: report.id });
        void refresh();
        toast.success(m.report_deleted());
        return true;
      } catch {
        toast.error(m.report_delete_failed());
        return false;
      }
    },
    onFlag: async (report, reason) => {
      try {
        await flag.mutateAsync({ id: report.id, reason });
        void refresh();
        toast.success(m.report_flagged());
        return true;
      } catch (error) {
        const refused = error as { code?: string };
        toast.error(refused.code === "FORBIDDEN" ? m.report_flag_young() : m.report_flag_failed());
        return false;
      }
    },
  };
}
