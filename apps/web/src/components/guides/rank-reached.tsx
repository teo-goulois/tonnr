import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";

import type { Rank } from "../viewer/types";
import { RANKS } from "./guide-words";
import { RankBadge } from "./rank";

type RankReachedProps = {
  rank: Rank;
  // Opens what the account wrote, where its rank and the way to the next are.
  onSee: () => void;
};

/** What an account reads the day it reaches a rank: the emblem, which is now its own. */
export function RankReached({ rank, onSee }: RankReachedProps) {
  return (
    <div className="edge flex w-(--width) max-w-full items-center gap-s rounded-(--radius-m) bg-neutral-1 p-m text-neutral-10">
      <RankBadge
        rank={rank}
        size={44}
        aria-hidden
        className="animate-in duration-(--motion-large-duration) ease-theme-large fade-in zoom-in-50 motion-reduce:animate-none"
      />
      <div className="grid min-w-0 flex-1">
        <p className="font-medium">{m.rank_reached_title({ rank: RANKS[rank].short() })}</p>
        <p className="truncate text-s text-neutral-7">{RANKS[rank].name()}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onSee}>
        {m.rank_reached_see()}
      </Button>
    </div>
  );
}

/** Tells an account that it has reached a rank, over whatever screen it is on. */
export function tellRank(rank: Rank, onSee: () => void) {
  toast.custom(
    (id) => (
      <RankReached
        rank={rank}
        onSee={() => {
          toast.dismiss(id);
          onSee();
        }}
      />
    ),
    // At the top, where it covers nothing a phone is pressed on, and long enough to be read by
    // whoever was looking at the map.
    { position: "top-center", duration: 10_000 },
  );
}
