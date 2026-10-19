import {
  RECENTS_KEY,
  type Recent,
  readRecents,
  sameRecents,
  withViewed,
} from "@repo/client/recents";
import { useSyncExternalStore } from "react";

// What the reader looked at last, and how a list of it changes, live in packages/client, which
// the app for phones reads too. The browser keeps the list in force here. Decision 042.
export { RECENTS_MOST, type Recent, readRecents, withViewed } from "@repo/client/recents";

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
      // A browser that keeps nothing, or something this app did not write: nothing was looked at.
    }
  }
  return recents;
}

/** Puts a list in force, for every screen, and keeps it in the browser. */
export function setRecents(next: Recent[]) {
  const list = readRecents(next);
  if (sameRecents(list, current())) return;
  recents = list;
  try {
    if (list.length > 0) localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENTS_KEY);
  } catch {
    // The list then lasts until the page is left.
  }
  for (const listener of listeners) listener();
}

/** Says that the reader opened this, and answers the list as it is then. */
export function viewRecent(viewed: Recent) {
  setRecents(withViewed(current(), viewed));
  return recents;
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

/** What the reader looked at last, the last first. The server knows of none. */
export function useRecents() {
  return useSyncExternalStore(subscribe, current, () => NONE);
}
