import type { Verdict } from "@repo/conditions/sea-now";
import type { ShoreWind } from "@repo/conditions/shore-wind";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

import { TideTrend } from "@/components/alerts/tide-trend";
import { formatClock, formatSeconds } from "@/lib/format";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

import { Bearing } from "../bearing";
import { SHORE_WIND_NAMES } from "./parts";

// The sea now in one sentence, in the panel of a break, a spot or a buoy: what the tiles read,
// written as the page of a break writes it (decision 059) and as the editor of an alert writes
// its own, then what fits the place's own words and what does not. Decision 061.

/** What the sentence is given: each figure as the tiles read it, undefined where there is none. */
export type SeaNowProps = {
  waves: { height?: number; period?: number; direction?: number };
  // The wind in knots, and how it meets the shore where the place knows its shore.
  wind: { knots?: number; direction?: number; atShore: ShoreWind | null };
  // Null where no tide is predicted. `next` is the next high or low water.
  tide: { trend: "rising" | "falling"; next?: { type: "high" | "low"; time: Date } } | null;
  // Null at a place that has no words to be judged by, as a buoy.
  verdict: Verdict | null;
  isLoading: boolean;
};

// How the editor underlines a part its writer sets: the page's sentence draws the same.
const underlined =
  "underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em]";

type Judged = Verdict["fits"][number];
// How a part is drawn once the place's words have judged it: on a green ground where it fits,
// on a light red one where it does not, and bare where nothing judged it.
type Judgement = "fits" | "off" | undefined;

function Part({
  children,
  judged,
  className,
}: {
  children: ReactNode;
  judged?: Judgement;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-medium text-neutral-10",
        judged === undefined ? underlined : "rounded-[0.35em] px-[0.3em]",
        judged === "fits" && "bg-success-transparent",
        judged === "off" && "bg-error-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** What the verdict says of one thing, for the part that writes it. */
function judgementOf(verdict: Verdict | null, thing: Judged): Judgement {
  if (!verdict) return undefined;
  return verdict.fits.includes(thing) ? "fits" : verdict.off.includes(thing) ? "off" : undefined;
}

const PART_NAMES: Record<Judged, () => string> = {
  swell: m.page_now_part_swell,
  size: m.page_now_part_size,
  wind: m.page_now_part_wind,
  tide: m.page_now_part_tide,
};

/** The names of things, as a list is said in the reader's language. */
function listOf(things: Judged[]) {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    things.map((thing) => PART_NAMES[thing]()),
  );
}

/** A part of the sentence that is written with a comma before it. */
function After({ children }: { children: ReactNode[] }) {
  return (
    <>
      {children.map((part, index) => (
        // The parts keep their order: nothing else tells them apart.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={index}>, {part}</Fragment>
      ))}
    </>
  );
}

/**
 * The card of the sea now. With neither waves nor wind to say, it says that there is no
 * forecast, so that a phone's sheet still has something to open on.
 */
export function SeaNow({ waves, wind, tide, verdict, isLoading }: SeaNowProps) {
  useUnits();

  const waveParts: ReactNode[] = [];
  const judged = (thing: Judged) => judgementOf(verdict, thing);
  if (waves.height !== undefined) {
    waveParts.push(<Part judged={judged("size")}>{formatHeight(waves.height)}</Part>);
  }
  if (waves.period !== undefined) {
    waveParts.push(<Part>{m.alert_period_of({ range: formatSeconds(waves.period) })}</Part>);
  }
  if (waves.direction !== undefined) {
    waveParts.push(
      <Part judged={judged("swell")} className="whitespace-nowrap">
        {m.alert_from()} <Bearing degrees={waves.direction} named />
      </Part>,
    );
  }
  const windParts: ReactNode[] = [];
  if (wind.knots !== undefined) windParts.push(<Part>{formatWind(wind.knots)}</Part>);
  if (wind.direction !== undefined) {
    windParts.push(
      // Judged by its name where the place knows no shore: the shore's word takes it otherwise.
      <Part judged={wind.atShore ? undefined : judged("wind")} className="whitespace-nowrap">
        {m.alert_from()} <Bearing degrees={wind.direction} named />
      </Part>,
    );
  }
  if (wind.atShore) {
    windParts.push(<Part judged={judged("wind")}>{SHORE_WIND_NAMES[wind.atShore]()}</Part>);
  }
  const [first, ...waveRest] = waveParts;
  const [windFirst, ...windRest] = windParts;
  const isJudged = verdict && (verdict.fits.length > 0 || verdict.off.length > 0);

  return (
    <section className="grid gap-xs rounded-(--radius-xs) bg-neutral-2 px-s py-s">
      <h3 className="text-xs text-neutral-7">{m.page_now_title()}</h3>
      {isLoading ? (
        <div className="grid gap-xs">
          <Skeleton className="h-(--line-m) w-full rounded-(--radius-xs)" />
          <Skeleton className="h-(--line-m) w-2/3 rounded-(--radius-xs)" />
        </div>
      ) : first === undefined && windFirst === undefined ? (
        <p className="text-s text-neutral-7">{m.forecast_none()}</p>
      ) : (
        <p className="text-m text-neutral-7">
          {first !== undefined && (
            <>
              {m.page_now_says_waves()} {first}
              <After>{waveRest}</After>
            </>
          )}
          {windFirst !== undefined && (
            <>
              {first !== undefined && ", "}
              {m.page_now_says_wind()} {windFirst}
              <After>{windRest}</After>
            </>
          )}
          {tide && (
            <>
              , {m.page_now_says_tide()}{" "}
              <Part judged={judged("tide")}>
                <TideTrend trend={tide.trend} />
              </Part>
              {tide.next && (
                <>
                  ,{" "}
                  <Part>
                    {tide.next.type === "high"
                      ? m.page_now_high_at({ time: formatClock(tide.next.time) })
                      : m.page_now_low_at({ time: formatClock(tide.next.time) })}
                  </Part>
                </>
              )}
            </>
          )}
          .
        </p>
      )}
      {!isLoading && isJudged && (
        <p className="text-s text-neutral-7">
          {verdict.fits.length > 0 && (
            <span className="text-neutral-10">
              {m.page_now_fits({ parts: listOf(verdict.fits) })}
            </span>
          )}
          {verdict.fits.length > 0 && verdict.off.length > 0 && " "}
          {verdict.off.length > 0 && m.page_now_off({ parts: listOf(verdict.off) })}
        </p>
      )}
    </section>
  );
}
