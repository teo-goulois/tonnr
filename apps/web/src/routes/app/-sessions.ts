import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { SessionOpen, SessionPlace, Sessioning } from "@/components/sessions/types";
import type { Loadable, MediaItem } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { dropUpload, forgetSent, retryUpload, startUploads, useUploads } from "./-media";

// A log is read whole while it is short: a longer one shows its latest sessions.
const LOG_MOST = 200;
// How often the media of a session are asked again while one is not yet made.
const MEDIA_EVERY_MS = 3000;
const NO_MEDIA: Readonly<Record<string, MediaItem[]>> = {};

// Whether some medium of an answer is still being sent or made.
function isMaking(answer: { sessions: Record<string, MediaItem[]> } | undefined) {
  return Object.values(answer?.sessions ?? {}).some((items) =>
    items.some((item) => item.state === "uploading" || item.state === "processing"),
  );
}

type Asked = {
  signedIn: boolean;
  // Whether the log is in view: it is read then, and not before.
  isLogShown: boolean;
  // The place whose panel is open, when it is one a session can be at.
  place: SessionPlace | undefined;
  // Opens the log, from the word that says a session was kept.
  onSeeLog: () => void;
};

// What a query gives a screen, the same from one render to the next while the query says the
// same: a panel that reads it is not drawn again for nothing.
function useLoadable<Data>(query: {
  data: Data | undefined;
  isLoading: boolean;
  isError: boolean;
}): Loadable<Data> {
  const { data, isLoading, isError } = query;
  return useMemo(() => ({ data, isPending: isLoading, isError }), [data, isLoading, isError]);
}

/**
 * An account's log of its sessions, for the screens that show it: the log and what it comes to,
 * the sessions of the place that is open, and the sheet a session is written in. Decision 043.
 */
export function useSessions({ signedIn, isLogShown, place, onSeeLog }: Asked): Sessioning {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<SessionOpen | null>(null);
  // The year and the month of the recap are the ones of where the reader is.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const quiet = { retry: false, meta: { quiet: true } };
  const log = useQuery(
    orpc.v1.sessions.list.queryOptions({
      input: { limit: LOG_MOST },
      enabled: signedIn && isLogShown,
      select: (answer) => answer.sessions,
      ...quiet,
    }),
  );
  const recap = useQuery(
    orpc.v1.sessions.recap.queryOptions({
      input: { zone },
      enabled: signedIn && isLogShown,
      ...quiet,
    }),
  );
  const here = useQuery(
    orpc.v1.sessions.list.queryOptions({
      input: {
        ...(place?.kind === "spot" ? { spotId: place.id } : { breakId: place?.id ?? "" }),
        limit: LOG_MOST,
      },
      enabled: signedIn && place !== undefined,
      select: (answer) => answer.sessions,
      ...quiet,
    }),
  );
  const openId = open?.sessionId;
  const detail = useQuery(
    orpc.v1.sessions.get.queryOptions({
      input: { id: openId ?? "" },
      enabled: signedIn && openId !== undefined,
      ...quiet,
    }),
  );

  // The photos and the videos: whether the instance takes them, those of the session the sheet
  // is open on, and those of the sessions of the log and of the place. Asked again every few
  // seconds while one is being made. Decision 066.
  const mediaStatus = useQuery(
    orpc.v1.media.status.queryOptions({ enabled: signedIn, staleTime: 5 * 60 * 1000, ...quiet }),
  );
  const making = (query: {
    state: { data: { sessions: Record<string, MediaItem[]> } | undefined };
  }) => (isMaking(query.state.data) ? MEDIA_EVERY_MS : false);
  const openMedia = useQuery(
    orpc.v1.media.sessions.queryOptions({
      input: { sessionIds: [openId ?? ""] },
      enabled: signedIn && openId !== undefined,
      select: (answer) => answer.sessions[openId ?? ""] ?? [],
      refetchInterval: making,
      ...quiet,
    }),
  );
  const listedIds = useMemo(
    () =>
      [...new Set([...(log.data ?? []), ...(here.data ?? [])].map((session) => session.id))]
        .sort()
        .slice(0, LOG_MOST),
    [log.data, here.data],
  );
  const listedMedia = useQuery(
    orpc.v1.media.sessions.queryOptions({
      input: { sessionIds: listedIds },
      enabled: signedIn && listedIds.length > 0 && mediaStatus.data?.offered !== false,
      refetchInterval: making,
      ...quiet,
    }),
  );
  const uploads = useUploads();

  // Every list and the recap follow what was written, and so do the media.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.sessions.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.media.key() }),
    ]);
  // Whether files of a form are still going up when it is saved: they go on, and say so.
  const stillSending = (ids: string[]) =>
    [...uploads.values()].some(
      (upload) => upload.state === "sending" && ids.includes(upload.id ?? ""),
    );
  const create = useMutation(orpc.v1.sessions.create.mutationOptions());
  const update = useMutation(orpc.v1.sessions.update.mutationOptions());
  const remove = useMutation(orpc.v1.sessions.delete.mutationOptions());

  const answered = {
    log: useLoadable(log),
    recap: useLoadable(recap),
    here: useLoadable(here),
    detail: useLoadable(detail),
  };
  const answeredMedia = { open: useLoadable(openMedia) };

  return {
    ...answered,
    open,
    // The session of another opening is not shown while the one that is asked for comes.
    detail: {
      ...answered.detail,
      data: openId === detail.data?.id ? detail.data : undefined,
    },
    onBegin: (at) => setOpen(at ? { place: at } : {}),
    onOpen: (session) => setOpen({ sessionId: session.id }),
    onClose: () => setOpen(null),
    isSaving: create.isPending || update.isPending,
    onAdd: async (at, draft) => {
      try {
        const made = await create.mutateAsync({
          ...(at.kind === "spot" ? { spotId: at.id } : { breakId: at.id }),
          startedAt: draft.startedAt,
          durationMinutes: draft.durationMinutes,
          ...(draft.rating !== null && { rating: draft.rating }),
          ...(draft.note && { note: draft.note }),
          ...(draft.waveSize && { waveSize: draft.waveSize }),
          ...(draft.setSize && { setSize: draft.setSize }),
          ...(draft.mediaIds.length > 0 && { mediaIds: draft.mediaIds }),
        });
        setOpen(null);
        void refresh();
        if (stillSending(draft.mediaIds)) toast.info(m.media_still_sending());
        // The sea of a session that was written long after, or while the provider rests, is said
        // to be missing where the session is read: here it is kept, and that is the news.
        toast.success(m.session_saved({ name: made.place.name }), {
          action: { label: m.session_saved_see(), onClick: onSeeLog },
        });
        return true;
      } catch (error) {
        toast.error((error as Error).message);
        return false;
      }
    },
    onChange: async (session, changed) => {
      try {
        const kept = await update.mutateAsync({
          id: session.id,
          ...changed,
          // A note that is emptied is taken away.
          ...(changed.note !== undefined && { note: changed.note || null }),
        });
        queryClient.setQueryData(orpc.v1.sessions.get.queryKey({ input: { id: kept.id } }), kept);
        void refresh();
        toast.success(m.session_changed());
        if (changed.mediaIds && stillSending(changed.mediaIds)) toast.info(m.media_still_sending());
        return true;
      } catch (error) {
        toast.error((error as Error).message);
        return false;
      }
    },
    media: {
      status: mediaStatus.data,
      open: answeredMedia.open,
      bySession: listedMedia.data?.sessions ?? NO_MEDIA,
      uploads,
      onStart: (files) => {
        const { started, refused } = startUploads(files);
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
      onDrop: dropUpload,
      onForget: forgetSent,
    },
    isDeleting: remove.isPending,
    onDelete: async (session) => {
      try {
        await remove.mutateAsync({ id: session.id });
        setOpen(null);
        queryClient.removeQueries({
          queryKey: orpc.v1.sessions.get.queryKey({ input: { id: session.id } }),
        });
        void refresh();
        toast.success(m.session_deleted());
        return true;
      } catch (error) {
        toast.error((error as Error).message);
        return false;
      }
    },
  };
}
