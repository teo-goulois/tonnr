import {
  RECENTS_KEY,
  type Recent,
  readRecents,
  sameRecents,
  withViewed,
} from "@repo/client/recents";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

// What the reader looked at last, a station, a break or a spot of their own: decision 042. How
// a list of it changes lives in packages/client, which the web app reads too. The phone keeps
// the list in force here, in the localStorage that expo-sqlite gives the app, so that a screen
// opens with it and a visitor has one; an account keeps it too, so that it is the same on every
// device. The place's sheet says what was opened with `useRecentViews`, and the saved tab reads
// the list with `useRecentPlaces`.

export { RECENTS_MOST, type Recent } from "@repo/client/recents";

const NONE: Recent[] = [];

let recents = NONE;
let isRead = false;
const listeners = new Set<() => void>();

function current() {
  if (!isRead) {
    isRead = true;
    try {
      recents = readRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null"));
    } catch {
      // A phone that keeps nothing, or something this app did not write: nothing was looked at.
    }
  }
  return recents;
}

/** Puts a list in force, for every screen, and keeps it on the phone. */
export function setRecents(next: Recent[]) {
  const list = readRecents(next);
  if (sameRecents(list, current())) return;
  recents = list;
  try {
    if (list.length > 0) localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENTS_KEY);
  } catch {
    // The list then lasts until the app is closed.
  }
  for (const listener of listeners) listener();
}

/** Forgets what was looked at: the reader asked, or the account that looked signed out. */
export function clearRecents() {
  setRecents(NONE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the reader looked at last, the last first. */
export function useRecents() {
  return useSyncExternalStore(subscribe, current, () => NONE);
}

const recentsKey = () => orpc.v1.preferences.getRecents.queryKey();

/** Reads what the account keeps, and puts it in force: what every device then shows. */
function useKeptRecents(signedIn: boolean) {
  const kept = useQuery(
    orpc.v1.preferences.getRecents.queryOptions({
      enabled: signedIn,
      // An API from before the recent views answers with an error: the phone's own then stand.
      retry: false,
    }),
  );
  useEffect(() => {
    if (kept.data) setRecents(kept.data);
  }, [kept.data]);
  return kept;
}

/**
 * What the saved tab shows of what was looked at last, and what clears it, on the phone and in
 * the account. `refresh` reads the account's list again.
 */
export function useRecentPlaces() {
  const { signedIn } = useAccount();
  const list = useRecents();
  const queryClient = useQueryClient();
  const kept = useKeptRecents(signedIn);
  const clear = useMutation(
    orpc.v1.preferences.clearRecents.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(recentsKey(), data),
    }),
  );

  return {
    recents: list,
    onClear: () => {
      clearRecents();
      if (!signedIn) return;
      // An answer on its way would bring the list back as it was.
      void queryClient.cancelQueries({ queryKey: recentsKey() });
      clear.mutate(undefined);
    },
    refresh: async () => {
      if (signedIn) await kept.refetch();
    },
  };
}

/**
 * Says what is open, once its name and its place are known, as the web's `useRecentViews` does:
 * the list changes on the phone at once, then the account confirms it. For the place's sheet.
 */
export function useRecentViews(viewed: Recent | undefined) {
  const { signedIn, pending, userId } = useAccount();
  const queryClient = useQueryClient();
  useKeptRecents(signedIn);
  const save = useMutation(
    orpc.v1.preferences.saveRecent.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(recentsKey(), data),
    }),
  );
  const saveView = save.mutate;

  // A view is said once, when what is open changes or when another account reads it.
  const said = useRef<string>(undefined);
  const kind = viewed?.kind;
  const id = viewed?.id;
  useEffect(() => {
    if (pending || !viewed) return;
    const saying = `${userId ?? ""} ${viewed.kind} ${viewed.id}`;
    if (said.current === saying) return;
    said.current = saying;
    setRecents(withViewed(current(), viewed));
    if (!signedIn) return;
    void queryClient.cancelQueries({ queryKey: recentsKey() });
    saveView({ kind: viewed.kind, id: viewed.id });
    // What is open is known by its kind and its id: its name coming again says nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, userId, kind, id]);
}
