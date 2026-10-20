import type { Arc } from "@repo/client/alerts/alert-words";

// The angles of the compass an alert's sector is set on: where a finger points, which end of the
// sector it takes, and the sectors that say how a wind meets the shore. No React Native in it, so
// that a test reads it. Decision 031, "The editor".

/** A handle moves by this many degrees, dragged or raised and lowered by a screen reader. */
export const COMPASS_STEP = 5;

/** An angle between 0 and 360. */
export const onCompass = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Where a handle that moves comes to rest: on one of the dial's steps. */
export const onStep = (degrees: number) =>
  onCompass(Math.round(degrees / COMPASS_STEP) * COMPASS_STEP);

/** The bearing a point points at from the middle of the dial, clockwise from north: y goes down. */
export function bearingOf(dx: number, dy: number) {
  return onCompass((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** How far apart two bearings are, the short way round. */
export function apart(one: number, other: number) {
  const turn = onCompass(one - other);
  return Math.min(turn, 360 - turn);
}

/** The end of a sector a press at a bearing takes: the nearer one. */
export function nearestEnd(arc: Arc, bearing: number): "from" | "to" {
  return apart(arc.from, bearing) <= apart(arc.to, bearing) ? "from" : "to";
}

/** A sector turned whole by some degrees, its two ends together. */
export function turned(arc: Arc, by: number): Arc {
  return { from: onCompass(arc.from + by), to: onCompass(arc.to + by) };
}

/** The turn from one bearing to another, the short way round: from -180 to 180. */
export function turnBetween(from: number, to: number) {
  const turn = onCompass(to - from);
  return turn > 180 ? turn - 360 : turn;
}

/**
 * The sectors that say how a wind meets a shore whose offshore wind comes from `offshore`, each
 * as far as `shoreWind` reads its words: offshore alone, offshore to cross-offshore, and offshore
 * to cross-shore, which is every wind but one that blows onto the beach.
 */
export function shoreSectors(offshore: number) {
  const around = (half: number): Arc => ({
    from: onCompass(Math.round(offshore - half)),
    to: onCompass(Math.round(offshore + half)),
  });
  return { offshore: around(22), crossOffshore: around(67), crossShore: around(112) };
}

/** Whether two sectors are the same. */
export const sameArc = (one: Arc | undefined, other: Arc | undefined) =>
  one !== undefined &&
  other !== undefined &&
  onCompass(one.from) === onCompass(other.from) &&
  onCompass(one.to) === onCompass(other.to);
