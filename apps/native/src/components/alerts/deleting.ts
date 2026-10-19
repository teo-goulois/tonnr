import type { Alert } from "@repo/client/viewer/types";
import { MutationObserver } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { orpc, queryClient } from "@/utils/orpc";

// An alert that is deleted from a list goes at once, and is deleted for good a few seconds later,
// unless its toast is undone meanwhile, as a mail program deletes a mail. Nothing is lost by the
// undo: the alert keeps what it saw and told. What waits is deleted at once when the app leaves
// the screen for the background, where no toast can be pressed. Chosen here.

/** How long an undo is offered. */
export const UNDO_MS = 5000;

type Waiting = {
  alert: Alert;
  timer: ReturnType<typeof setTimeout>;
  onFailed: () => void;
  // Asked of the API already: it is not asked twice, nor undone once it is.
  asked?: boolean;
};

const waiting = new Map<string, Waiting>();
let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish() {
  hidden = new Set(waiting.keys());
  for (const listener of listeners) listener();
}

async function deleteNow(id: string) {
  const one = waiting.get(id);
  if (!one || one.asked) return;
  one.asked = true;
  clearTimeout(one.timer);
  const listKey = orpc.v1.alerts.list.queryKey();
  try {
    // Through the query client, as a screen's mutation is, from a module that outlives the screen.
    await new MutationObserver(queryClient, orpc.v1.alerts.delete.mutationOptions()).mutate({
      id,
    });
    queryClient.setQueryData(listKey, (answer) =>
      answer ? { alerts: answer.alerts.filter((alert) => alert.id !== id) } : answer,
    );
  } catch {
    one.onFailed();
  } finally {
    waiting.delete(id);
    publish();
    // An alert changes what its places say of themselves: their lists are asked for again.
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: orpc.v1.spots.key() });
  }
}

/** Takes an alert out of every list, and deletes it once its undo has run out. */
export function deleteLater(alert: Alert, onFailed: () => void) {
  if (waiting.has(alert.id)) return;
  waiting.set(alert.id, {
    alert,
    onFailed,
    timer: setTimeout(() => void deleteNow(alert.id), UNDO_MS),
  });
  publish();
}

/** Puts an alert back where it was: nothing was deleted. */
export function undoDelete(id: string) {
  const one = waiting.get(id);
  if (!one || one.asked) return;
  clearTimeout(one.timer);
  waiting.delete(id);
  publish();
}

/** Deletes at once every alert that waits for its undo to run out. */
export function deleteWaiting() {
  for (const id of waiting.keys()) void deleteNow(id);
}

AppState.addEventListener("change", (state) => {
  if (state !== "active") deleteWaiting();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The alerts that are deleted and wait for their undo to run out: no list shows them. */
export function useDeleting() {
  return useSyncExternalStore(subscribe, () => hidden);
}
