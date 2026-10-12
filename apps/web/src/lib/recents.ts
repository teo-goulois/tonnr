import type { AppRouterClient } from "@repo/api/routers/index";
import { useSyncExternalStore } from "react";

/**
 * What the reader looked at last: a station, a surf break or a spot of their own, the last
 * first. An account keeps it, so that it is the same on every device, and the browser keeps it
 * too, so that a page opens with it and a visitor has one. Decision 042.
 */
export type Recent = Omit<
  Awaited<ReturnType<AppRouterClient["preferences"]["getRecents"]>>[number],
  "viewedAt"
>;

// As many as the API keeps for an account.
export const RECENTS_MOST = 5;
const STORED_KEY = "tonnr:recents";
const KINDS: readonly unknown[] = ["station", "break", "spot"] satisfies Recent["kind"][];
const NONE: Recent[] = [];

let recents = NONE;
let isRead = false;
const listeners = new Set<() => void>();

const isSame = (one: Recent, other: Recent) => one.kind === other.kind && one.id === other.id;

/** The list once this was looked at: it comes first, once, and the oldest leaves. */
export function withViewed(list: Recent[], viewed: Recent) {
  return [viewed, ...list.filter((other) => !isSame(other, viewed))].slice(0, RECENTS_MOST);
}

/** What a browser kept, less whatever this app did not write. */
export function readRecents(stored: unknown): Recent[] {
  if (!Array.isArray(stored)) return NONE;
  const read: Recent[] = [];
  for (const one of stored as unknown[]) {
    if (typeof one !== "object" || one === null) continue;
    const { kind, id, name, latitude, longitude } = one as Record<string, unknown>;
    if (
      KINDS.includes(kind) &&
      typeof id === "string" &&
      typeof name === "string" &&
      typeof latitude === "number" &&
      typeof longitude === "number"
    ) {
      const recent = { kind: kind as Recent["kind"], id, name, latitude, longitude };
      if (!read.some((other) => isSame(other, recent))) read.push(recent);
    }
  }
  return read.slice(0, RECENTS_MOST);
}

function sameList(one: Recent[], other: Recent[]) {
  return (
    one.length === other.length &&
    one.every(
      (recent, index) =>
        isSame(recent, other[index]!) &&
        recent.name === other[index]!.name &&
        recent.latitude === other[index]!.latitude &&
        recent.longitude === other[index]!.longitude,
    )
  );
}

function current() {
  if (!isRead) {
    isRead = true;
    try {
      recents = readRecents(JSON.parse(localStorage.getItem(STORED_KEY) ?? "null"));
    } catch {
      // A browser that keeps nothing, or something this app did not write: nothing was looked at.
    }
  }
  return recents;
}

/** Puts a list in force, for every screen, and keeps it in the browser. */
export function setRecents(next: Recent[]) {
  const list = readRecents(next);
  if (sameList(list, current())) return;
  recents = list;
  try {
    if (list.length > 0) localStorage.setItem(STORED_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORED_KEY);
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
