import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";

import type { Rank } from "../viewer/types";
import { RANKS } from "./guide-words";
import { RankBadge } from "./rank";
import { LADDER, ladderShare, points, RANK_FROM } from "./ranks";

// The side of an emblem on the ladder, and the line that passes behind the middle of each.
const EMBLEM = 28;

type RankLadderProps = {
  score: number;
  // The highest rank the account reached. It stays when the score goes down again: an emblem
  // may then be in its colors before the line has come to it.
  rank: Rank | null;
};

/**
 * The way from one rank to the next: the emblem of each, in its colors once it is reached, the
 * score it is reached at, and a line that says how far the account's score has come.
 */
export function RankLadder({ score, rank }: RankLadderProps) {
  const reached = rank === null ? -1 : LADDER.indexOf(rank);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute inset-x-0 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-neutral-3"
        style={{ top: EMBLEM / 2 }}
      >
        <div
          className="h-full rounded-full bg-color-1 transition-[width] duration-(--motion-large-duration) ease-theme-large motion-reduce:transition-none"
          style={{ width: `${ladderShare(score) * 100}%` }}
        />
      </div>
      <ol className="relative grid grid-cols-3">
        {LADDER.map((one, index) => {
          const isReached = index <= reached;
          return (
            <li key={one} className="grid justify-items-center text-center">
              <RankBadge rank={one} size={EMBLEM} locked={!isReached} aria-hidden />
              <span className={cn("mt-xxs text-s font-medium", !isReached && "text-neutral-7")}>
                {RANKS[one].short()}
              </span>
              <span className="text-xs text-neutral-7 tabular-nums">{points(RANK_FROM[one])}</span>
              <span className="sr-only">{isReached ? m.rank_reached() : m.rank_not_reached()}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
