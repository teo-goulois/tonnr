import { RANK_FROM } from "@repo/config/ranks";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import type { Rank } from "../viewer/types";

// The ranks, from the first an account reaches, and the score each is reached at: the API awards
// them by the same numbers. Decision 041.
export const LADDER = (Object.keys(RANK_FROM) as Rank[]).sort(
  (one, other) => RANK_FROM[one] - RANK_FROM[other],
);
export { RANK_FROM };

/**
 * A number of points, as it is written. Each language says which numbers are one: French says
 * it of none as well.
 */
export function points(count: number) {
  return new Intl.PluralRules(getLocale()).select(count) === "one"
    ? m.contributions_point_one({ count })
    : m.contributions_points({ count });
}

/** Whether a rank is above another. No rank is under every rank. */
export function isHigherRank(rank: Rank, than: Rank | null) {
  return than === null || LADDER.indexOf(rank) > LADDER.indexOf(than);
}

/**
 * How far along the ladder a score is, from 0 to 1. Each rank stands in the middle of its share
 * of the width, and the way from one rank to the next is drawn as long as any other, whatever
 * the points between the two: drawn to scale, the first rank would touch the start.
 */
export function ladderShare(score: number) {
  let before = { score: 0, share: 0 };
  for (const [index, rank] of LADDER.entries()) {
    const stop = { score: RANK_FROM[rank], share: (2 * index + 1) / (2 * LADDER.length) };
    if (score < stop.score) {
      const done = (score - before.score) / (stop.score - before.score);
      return before.share + Math.max(0, done) * (stop.share - before.share);
    }
    before = stop;
  }
  return 1;
}

// The rank this browser last read for an account. An account is told of a rank it reached
// since: what is kept here says which it already knows of.
const keyOf = (account: string) => `tonnr:rank:${account}`;
const NONE = "none";

/** The rank this browser last read for an account. Undefined when it never read one. */
export function seenRank(account: string): Rank | null | undefined {
  try {
    const kept = localStorage.getItem(keyOf(account));
    if (kept === NONE) return null;
    return LADDER.find((rank) => rank === kept);
  } catch {
    return undefined;
  }
}

export function keepSeenRank(account: string, rank: Rank | null) {
  try {
    localStorage.setItem(keyOf(account), rank ?? NONE);
  } catch {
    // A browser that keeps nothing is told of no rank: it could not know which is new.
  }
}
