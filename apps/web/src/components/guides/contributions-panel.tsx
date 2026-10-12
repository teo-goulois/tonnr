import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { m } from "@/paraglide/messages.js";

import { CHARACTERISTIC_FIELDS, readCharacteristic } from "../viewer/break-characteristics";
import type { Contribution, Loadable, Standing } from "../viewer/types";
import { isTextLine, RANKS, TEXT_LINES } from "./guide-words";
import { RankBadge } from "./rank";
import { RankLadder } from "./rank-ladder";
import { points } from "./ranks";

// What became of a contribution, as its author reads it, and the color that says so.
const STATES: Record<
  Contribution["status"],
  { label: () => string; variant: "neutral" | "success" | "warning" | "error" }
> = {
  pending: { label: m.contribution_pending, variant: "warning" },
  shown: { label: m.contribution_shown, variant: "warning" },
  confirmed: { label: m.contribution_confirmed, variant: "success" },
  refused: { label: m.contribution_refused, variant: "error" },
  superseded: { label: m.contribution_superseded, variant: "neutral" },
  withdrawn: { label: m.contribution_withdrawn, variant: "neutral" },
};

/** The line a contribution is of, and what it says, as they read. */
export function readContribution(one: Pick<Contribution, "line" | "value">) {
  if (one.line === "place") return { label: m.contribution_place(), value: null };
  if (isTextLine(one.line)) {
    return {
      label: TEXT_LINES[one.line].label(),
      value: typeof one.value === "string" ? one.value : null,
    };
  }
  const field = CHARACTERISTIC_FIELDS.find((found) => found.key === one.line);
  return {
    label: field?.label() ?? one.line,
    value: Array.isArray(one.value) ? readCharacteristic(one.line, one.value) : null,
  };
}

type ContributionsPanelProps = {
  standing: Loadable<Standing>;
  // Opens the guide of the break a contribution is of.
  onOpenBreak: (breakId: string) => void;
};

/**
 * What an account wrote in the guides and what became of it, with where the account stands: the
 * emblem of the rank it reached, its score, and the way to the next rank. An account that has
 * reached none reads the first one in gray: what there is to reach. Decision 041.
 */
export function ContributionsPanel({ standing, onOpenBreak }: ContributionsPanelProps) {
  const known = standing.data;
  if (!known) {
    return standing.isError ? (
      <p className="text-s text-neutral-7">{m.contributions_failed()}</p>
    ) : (
      <div className="grid gap-s" aria-hidden>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }
  const { next } = known;
  // The emblem at the head: the account's, or in gray the first there is to reach.
  const emblem = known.rank ?? next?.rank;

  return (
    <div className="grid gap-l">
      <div className="grid gap-s">
        <div className="flex items-center gap-s">
          {emblem && <RankBadge rank={emblem} size={56} locked={known.rank === null} aria-hidden />}
          <div className="grid min-w-0">
            <p className="text-l font-medium">
              {known.rank ? RANKS[known.rank].name() : m.contributions_no_rank()}
            </p>
            <p className="text-s text-neutral-7 tabular-nums">{points(known.score)}</p>
          </div>
        </div>
        <RankLadder score={known.score} rank={known.rank} />
        <p className="text-s">
          {next
            ? m.contributions_next({
                points: points(Math.max(0, next.from - known.score)),
                rank: RANKS[next.rank].short(),
              })
            : m.contributions_top()}
        </p>
        <p className="text-s text-neutral-7">{m.contributions_scale()}</p>
        {known.sponsorships > 0 && (
          <p className="text-s">
            {known.sponsorships === 1
              ? m.contributions_sponsorships_one()
              : m.contributions_sponsorships({ count: known.sponsorships })}
          </p>
        )}
        {known.trusted && <p className="text-s">{m.contributions_trusted()}</p>}
      </div>

      {known.contributions.length === 0 ? (
        <p className="text-s text-neutral-7">{m.contributions_empty()}</p>
      ) : (
        <ul className="grid gap-m">
          {known.contributions.map((one) => {
            const { label, value } = readContribution(one);
            const place = one.break;
            return (
              <li key={one.id} className="grid gap-xxs text-s">
                <div className="flex flex-wrap items-center justify-between gap-x-s gap-y-xxs">
                  {place ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-xs max-w-full truncate px-xs font-medium"
                      onClick={() => onOpenBreak(place.id)}
                    >
                      {place.name}
                    </Button>
                  ) : (
                    <span className="text-neutral-7">{m.contribution_break_gone()}</span>
                  )}
                  <Badge variant={STATES[one.status].variant}>{STATES[one.status].label()}</Badge>
                </div>
                <p className="text-neutral-7">{label}</p>
                {value && <div className="break-words">{value}</div>}
                {one.status === "refused" && one.reason && (
                  <p className="text-neutral-7">{m.contribution_reason({ reason: one.reason })}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
