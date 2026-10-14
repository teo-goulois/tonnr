import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { SessionOpen, SessionPlace, Sessioning } from "@/components/sessions/types";
import type { Loadable } from "@/components/viewer/types";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// A log is read whole while it is short: a longer one shows its latest sessions.
const LOG_MOST = 200;

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

  // Every list and the recap follow what was written.
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.v1.sessions.key() });
  const create = useMutation(orpc.v1.sessions.create.mutationOptions());
  const update = useMutation(orpc.v1.sessions.update.mutationOptions());
  const remove = useMutation(orpc.v1.sessions.delete.mutationOptions());

  const answered = {
    log: useLoadable(log),
    recap: useLoadable(recap),
    here: useLoadable(here),
    detail: useLoadable(detail),
  };

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
        });
        setOpen(null);
        void refresh();
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
        return true;
      } catch (error) {
        toast.error((error as Error).message);
        return false;
      }
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
