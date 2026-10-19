import type { SessionDraft, SessionPlace } from "@repo/client/sessions/types";
import type { MediaItem, Session } from "@repo/client/viewer/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCalendars } from "expo-localization";
import { router } from "expo-router";
import { useMemo } from "react";

import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { stillSending } from "@/lib/uploads";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// An account's log of its sessions, as the screens of the app read it and write to it: the log and
// what it comes to, the sessions at a place, one session with what the sea did, and their photos
// and videos. The web's `-sessions.ts` asks the same of the API. Decisions 043 and 066.

// A log is read whole while it is short: a longer one shows its latest sessions.
export const LOG_MOST = 200;
/** Where the log is: one step into the account's tab. */
export const LOGBOOK = "/account/logbook";
// How often the media of a session are asked again while one is not yet made.
const MEDIA_EVERY_MS = 3000;
const NO_MEDIA: Readonly<Record<string, MediaItem[]>> = {};

type MediaAnswer = { sessions: Record<string, MediaItem[]> } | undefined;

// Whether some medium of an answer is still being sent or made.
function isMaking(answer: MediaAnswer) {
  return Object.values(answer?.sessions ?? {}).some((items) =>
    items.some((item) => item.state === "uploading" || item.state === "processing"),
  );
}
const making = (query: { state: { data: MediaAnswer } }) =>
  isMaking(query.state.data) ? MEDIA_EVERY_MS : false;

/** The time zone the phone is set to: the recap's month and year are the reader's. */
export function phoneZone() {
  return getCalendars()[0]?.timeZone ?? "UTC";
}

/** Whether the instance takes photos and videos, for an account. Decision 066. */
export function useMediaStatus() {
  const { signedIn } = useAccount();
  return useQuery(
    orpc.v1.media.status.queryOptions({
      enabled: signedIn,
      staleTime: 5 * 60 * 1000,
      retry: false,
    }),
  );
}

/** The photos and videos of the sessions of a list, by session. */
function useListedMedia(sessions: readonly Session[] | undefined) {
  const { signedIn } = useAccount();
  const status = useMediaStatus();
  const ids = useMemo(
    () => [...new Set((sessions ?? []).map((session) => session.id))].sort().slice(0, LOG_MOST),
    [sessions],
  );
  const media = useQuery(
    orpc.v1.media.sessions.queryOptions({
      input: { sessionIds: ids },
      enabled: signedIn && ids.length > 0 && status.data?.offered !== false,
      refetchInterval: making,
      retry: false,
    }),
  );
  return media.data?.sessions ?? NO_MEDIA;
}

/** The account's log, the latest session first, what it comes to, and the media of its sessions. */
export function useSessionLog() {
  const { signedIn } = useAccount();
  const log = useQuery(
    orpc.v1.sessions.list.queryOptions({
      input: { limit: LOG_MOST },
      enabled: signedIn,
      select: (answer) => answer.sessions,
      retry: false,
    }),
  );
  const recap = useQuery(
    orpc.v1.sessions.recap.queryOptions({
      input: { zone: phoneZone() },
      enabled: signedIn,
      retry: false,
    }),
  );
  const media = useListedMedia(log.data);
  return { log, recap, media };
}

/** The sessions the account surfed at a place, the latest first, with their media. */
export function useSessionsAt(place: Pick<SessionPlace, "kind" | "id"> | undefined) {
  const { signedIn } = useAccount();
  const here = useQuery(
    orpc.v1.sessions.list.queryOptions({
      input: {
        ...(place?.kind === "spot" ? { spotId: place.id } : { breakId: place?.id ?? "" }),
        limit: LOG_MOST,
      },
      enabled: signedIn && place !== undefined,
      select: (answer) => answer.sessions,
      retry: false,
    }),
  );
  const media = useListedMedia(here.data);
  return { here, media };
}

/** One session of the log, with the conditions kept with it, and its photos and videos. */
export function useSessionDetail(id: string | undefined) {
  const { signedIn } = useAccount();
  const detail = useQuery(
    orpc.v1.sessions.get.queryOptions({
      input: { id: id ?? "" },
      enabled: signedIn && id !== undefined,
      retry: false,
    }),
  );
  const media = useSessionMedia(id);
  return { detail, media };
}

/** The photos and the videos of one session, asked again while one is being made. */
export function useSessionMedia(id: string | undefined) {
  const { signedIn } = useAccount();
  return useQuery(
    orpc.v1.media.sessions.queryOptions({
      input: { sessionIds: [id ?? ""] },
      enabled: signedIn && id !== undefined,
      select: (answer) => answer.sessions[id ?? ""] ?? [],
      refetchInterval: making,
      retry: false,
    }),
  );
}

/**
 * What writes the log: a new session, a change to one, its deletion. Each tells what it came to,
 * and every list, the recap and the media follow.
 */
export function useSessionWrites() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const create = useMutation(orpc.v1.sessions.create.mutationOptions());
  const update = useMutation(orpc.v1.sessions.update.mutationOptions());
  const remove = useMutation(orpc.v1.sessions.delete.mutationOptions());

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.v1.sessions.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.v1.media.key() }),
    ]);
  const failed = (error: unknown) =>
    tell({ title: (error as Error).message || m.native_session_failed(), tone: "danger" });

  return {
    isSaving: create.isPending || update.isPending,
    isDeleting: remove.isPending,
    /** Writes a session at a place. Answers whether it was kept. */
    add: async (place: SessionPlace, draft: SessionDraft) => {
      try {
        const made = await create.mutateAsync({
          ...(place.kind === "spot" ? { spotId: place.id } : { breakId: place.id }),
          startedAt: draft.startedAt,
          durationMinutes: draft.durationMinutes,
          ...(draft.rating !== null && { rating: draft.rating }),
          ...(draft.note && { note: draft.note }),
          ...(draft.waveSize && { waveSize: draft.waveSize }),
          ...(draft.setSize && { setSize: draft.setSize }),
          ...(draft.mediaIds.length > 0 && { mediaIds: draft.mediaIds }),
        });
        queryClient.setQueryData(orpc.v1.sessions.get.queryKey({ input: { id: made.id } }), made);
        void refresh();
        if (stillSending(draft.mediaIds)) tell({ title: m.media_still_sending() });
        // The sea of a session written long after, or while the provider rests, is said to be
        // missing where the session is read: here it is kept, and that is the news.
        tell({
          title: m.session_saved({ name: made.place.name }),
          tone: "success",
          action: { label: m.session_saved_see(), onPress: () => router.navigate(LOGBOOK) },
        });
        return true;
      } catch (error) {
        failed(error);
        return false;
      }
    },
    /** Changes a session: what of it was changed, or nothing, to have its sea read once more. */
    change: async (session: Pick<Session, "id">, changed: Partial<SessionDraft>) => {
      try {
        const kept = await update.mutateAsync({
          id: session.id,
          ...changed,
          // A note that is emptied is taken away.
          ...(changed.note !== undefined && { note: changed.note || null }),
        });
        queryClient.setQueryData(orpc.v1.sessions.get.queryKey({ input: { id: kept.id } }), kept);
        void refresh();
        tell({ title: m.session_changed(), tone: "success" });
        if (changed.mediaIds && stillSending(changed.mediaIds)) {
          tell({ title: m.media_still_sending() });
        }
        return true;
      } catch (error) {
        failed(error);
        return false;
      }
    },
    /** Deletes a session, its photos and videos with it. */
    remove: async (session: Pick<Session, "id">) => {
      try {
        await remove.mutateAsync({ id: session.id });
        queryClient.removeQueries({
          queryKey: orpc.v1.sessions.get.queryKey({ input: { id: session.id } }),
        });
        void refresh();
        tell({ title: m.session_deleted(), tone: "success" });
        return true;
      } catch (error) {
        failed(error);
        return false;
      }
    },
  };
}
