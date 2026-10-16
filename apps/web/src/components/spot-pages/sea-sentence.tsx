import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@repo/ui/components/ui/button";
import { BellIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

import { TideTrend } from "@/components/alerts/tide-trend";
import { Bearing } from "@/components/viewer/bearing";
import { SHORE_WIND_NAMES } from "@/components/viewer/details/parts";
import { formatClock, formatSeconds, toKnots } from "@/lib/format";
import type { SpotPage } from "@/lib/pages-api";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// The sea now in one sentence, on the page of a surf break: the hour of the kept forecast, as
// the editor of an alert writes its sentence, then what fits the break's own words and what does
// not, and the way to an alert at the spot. Decision 059.

// How the editor underlines a part its writer sets: `LandingAlert` draws the same.
const underlined =
  "underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em]";

function Part({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-medium text-neutral-10", underlined, className)}>{children}</span>
  );
}

type Judged = NonNullable<NonNullable<SpotPage["week"]>["now"]>["verdict"]["fits"][number];

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
 * The card under the title: nothing is drawn when no forecast is kept for the break's cell,
 * or when its hour has neither waves nor wind.
 */
export function SeaSentence({ page }: { page: SpotPage }) {
  useUnits();
  const now = page.week?.now ?? null;
  if (!now) return null;
  const { hour, atShore, verdict } = now;
  const zone = page.break.timezone ?? "UTC";
  const knots = toKnots(hour.windSpeedMetersPerSecond);
  const period = hour.wavePeakPeriodSeconds ?? hour.wavePeriodSeconds;
  const tide = page.tide?.now ? page.tide : null;
  const next = tide?.extremes[0];

  const waves: ReactNode[] = [];
  if (hour.waveHeightMeters !== null)
    waves.push(<Part>{formatHeight(hour.waveHeightMeters)}</Part>);
  if (period !== null) {
    waves.push(<Part>{m.alert_period_of({ range: formatSeconds(period) })}</Part>);
  }
  if (hour.waveDirectionDegrees !== null) {
    waves.push(
      <Part className="whitespace-nowrap">
        {m.alert_from()} <Bearing degrees={hour.waveDirectionDegrees} />
      </Part>,
    );
  }
  const wind: ReactNode[] = [];
  if (knots !== null) wind.push(<Part>{formatWind(knots)}</Part>);
  if (hour.windDirectionDegrees !== null) {
    wind.push(
      <Part className="whitespace-nowrap">
        {m.alert_from()} <Bearing degrees={hour.windDirectionDegrees} />
      </Part>,
    );
  }
  if (atShore) wind.push(<Part>{SHORE_WIND_NAMES[atShore]()}</Part>);
  if (waves.length === 0 && wind.length === 0) return null;

  const [first, ...waveRest] = waves;
  const [windFirst, ...windRest] = wind;

  return (
    <section className="grid gap-s rounded-(--radius-xs) bg-neutral-2 p-m sm:p-l">
      <h2 className="text-s font-medium text-neutral-7">{m.page_now_title()}</h2>
      <p className="text-m text-neutral-7 sm:text-l">
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
        {tide?.now && (
          <>
            , {m.page_now_says_tide()}{" "}
            <Part>
              <TideTrend trend={tide.now.trend} />
            </Part>
            {next && (
              <>
                ,{" "}
                <Part>
                  {next.type === "high"
                    ? m.page_now_high_at({ time: formatClock(next.time, zone) })
                    : m.page_now_low_at({ time: formatClock(next.time, zone) })}
                </Part>
              </>
            )}
          </>
        )}
        .
      </p>
      {(verdict.fits.length > 0 || verdict.off.length > 0) && (
        <p className="text-neutral-7">
          {verdict.fits.length > 0 && (
            <span className="text-neutral-10">
              {m.page_now_fits({ parts: listOf(verdict.fits) })}
            </span>
          )}
          {verdict.fits.length > 0 && verdict.off.length > 0 && " "}
          {verdict.off.length > 0 && m.page_now_off({ parts: listOf(verdict.off) })}
        </p>
      )}
      <div>
        <Link
          to="/app"
          search={{ break: page.break.id, create: "alert" }}
          className={cn(buttonVariants({ variant: "secondary" }), "group/alert")}
        >
          <BellIcon data-slot="icon" aria-hidden />
          {m.page_now_alert()}
        </Link>
      </div>
    </section>
  );
}
