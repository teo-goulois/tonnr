import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Meter, MeterIndicator, MeterLabel, MeterTrack } from "@repo/ui/components/ui/meter";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { CHARACTERISTIC_FIELDS, readCharacteristic } from "../viewer/break-characteristics";
import type { Contribution, Loadable, Standing } from "../viewer/types";
import { isTextLine, RANKS, TEXT_LINES } from "./guide-words";
import { RankBadge } from "./rank";

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

/**
 * A number of points, as it is written. Each language says which numbers are one: French says
 * it of none as well.
 */
export function points(count: number) {
  return new Intl.PluralRules(getLocale()).select(count) === "one"
    ? m.contributions_point_one({ count })
    : m.contributions_points({ count });
}

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
 * What an account wrote in the guides and what became of it, with where the account stands: its
 * score, the rank it reached, and how far the next one is. Decision 041.
 */
export function ContributionsPanel({ standing, onOpenBreak }: ContributionsPanelProps) {
  const known = standing.data;
  if (!known) {
    return standing.isError ? (
      <p className="text-s text-neutral-7">{m.contributions_failed()}</p>
    ) : (
      <div className="grid gap-s" aria-hidden>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }
  const { next } = known;

  return (
    <div className="grid gap-l">
      <div className="grid gap-s">
        <div className="flex flex-wrap items-center gap-x-s gap-y-xxs">
          <p className="text-l font-medium tabular-nums">{points(known.score)}</p>
          {known.rank ? (
            <span className="inline-flex items-center gap-xs text-s text-neutral-7">
              <RankBadge rank={known.rank} />
              {RANKS[known.rank].name()}
            </span>
          ) : (
            <span className="text-s text-neutral-7">{m.contributions_no_rank()}</span>
          )}
        </div>
        {next ? (
          <Meter value={Math.min(known.score, next.from)} min={0} max={next.from}>
            <div className="flex items-baseline justify-between gap-s text-s">
              <MeterLabel>
                {m.contributions_progress({ rank: RANKS[next.rank].short() })}
              </MeterLabel>
              <span className="text-neutral-7 tabular-nums">
                {m.contributions_next({
                  points: points(Math.max(0, next.from - known.score)),
                  rank: RANKS[next.rank].short(),
                })}
              </span>
            </div>
            <MeterTrack>
              <MeterIndicator />
            </MeterTrack>
          </Meter>
        ) : (
          <p className="text-s text-neutral-7">{m.contributions_top()}</p>
        )}
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
