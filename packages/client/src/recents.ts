import type { AppRouterClient } from "@repo/api/routers/index";

/**
 * What the reader looked at last: a station, a surf break or a spot of their own, the last
 * first. An account keeps it, so that it is the same on every device, and the device keeps it
 * too, so that a screen opens with it and a visitor has one. Decision 042.
 */
export type Recent = Omit<
  Awaited<ReturnType<AppRouterClient["v1"]["preferences"]["getRecents"]>>[number],
  "viewedAt"
>;

// As many as the API keeps for an account.
export const RECENTS_MOST = 5;
/** What a device keeps them under. */
export const RECENTS_KEY = "tonnr:recents";
const KINDS: readonly unknown[] = ["station", "break", "spot"] satisfies Recent["kind"][];
const NONE: Recent[] = [];

const isSame = (one: Recent, other: Recent) => one.kind === other.kind && one.id === other.id;

/** The list once this was looked at: it comes first, once, and the oldest leaves. */
export function withViewed(list: Recent[], viewed: Recent) {
  return [viewed, ...list.filter((other) => !isSame(other, viewed))].slice(0, RECENTS_MOST);
}

/** What a device kept, less whatever this app did not write. */
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

/** Whether two lists say the same, in the same order. */
export function sameRecents(one: Recent[], other: Recent[]) {
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
