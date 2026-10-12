import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";

import { Author, RankBadge, Username } from "@/components/guides/rank";
import { RankLadder } from "@/components/guides/rank-ladder";
import { RankReached, tellRank } from "@/components/guides/rank-reached";
import { LADDER } from "@/components/guides/ranks";

const SIZES = [14, 16, 20, 28, 44, 56];
const framed = "edge rounded-(--radius-xs) p-m";

/** The emblems of the ranks, an account written with its rank, and the way from rank to rank. */
export function RankSamples() {
  return (
    <div className="grid gap-m">
      {/* Each emblem at every size it is drawn at, then as it is before the rank is reached. */}
      <div className="grid gap-s">
        {LADDER.map((rank) => (
          <div key={rank} className="flex flex-wrap items-center gap-m">
            {SIZES.map((size) => (
              <RankBadge key={size} rank={rank} size={size} />
            ))}
            {SIZES.slice(3).map((size) => (
              <RankBadge key={size} rank={rank} size={size} locked />
            ))}
          </div>
        ))}
      </div>

      {/* An account as others read it: in a sentence, in a list, and when its name is long. */}
      <div className="grid gap-xs">
        <div className="flex flex-wrap items-center gap-m">
          {LADDER.map((rank) => (
            <Username key={rank} name="maelle_lg" rank={rank} />
          ))}
          <Username name="newcomer" rank={null} />
          <Author by={null} />
        </div>
        <div className="flex flex-wrap items-center gap-m text-s text-neutral-7">
          <Author by={{ username: "maelle_lg", rank: "cs" }} />
          <Author by={{ username: "yann_29", rank: "qs" }} />
          <Author by={{ username: "newcomer", rank: null }} />
        </div>
        <div className="flex flex-wrap items-center gap-m font-medium">
          <Username name="maelle_lg" rank="ct" size={20} />
          <span className="w-32">
            <Username name="a_very_long_username" rank="cs" />
          </span>
        </div>
      </div>

      {/* The ladder: no rank yet, on the way, a rank kept above the score, and the last one. */}
      <div className="grid gap-m lg:grid-cols-2">
        <div className={framed}>
          <RankLadder score={5} rank={null} />
        </div>
        <div className={framed}>
          <RankLadder score={95} rank="qs" />
        </div>
        <div className={framed}>
          <RankLadder score={130} rank="cs" />
        </div>
        <div className={framed}>
          <RankLadder score={640} rank="ct" />
        </div>
      </div>

      {/* What an account reads the day it reaches a rank. */}
      <div className="flex flex-wrap items-center gap-m">
        <RankReached rank="cs" onSee={() => toast("Opens the contributions")} />
        <Button
          variant="secondary"
          onClick={() => tellRank("ct", () => toast("Opens the contributions"))}
        >
          Reach the CT
        </Button>
      </div>
    </div>
  );
}
