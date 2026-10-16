import { factorFor, type PeriodBand, SWELL_SECTORS } from "@repo/conditions/sessions/size-factor";
import type { ReactNode } from "react";

import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "./bearing";
import { sizeStepsOf } from "./break-characteristics";
import type { Forecast, SizeFactor } from "./types";

// How big the waves of a break run against the forecast, in one sentence of grey prose under
// the tiles of its panel: what the sessions surfed there say, by the swell of the hour when
// enough of them were in it, then what the people who surf it wrote in its guide. Each is an
// estimate and says where it comes from, and nothing is drawn when neither says anything. The
// tiles, the charts and the alerts stay in the model's units: decision 062.

type Hour = Forecast["hours"][number];

const PERIODS: Record<PeriodBand, () => string> = {
  short: m.size_period_short,
  medium: m.size_period_medium,
  long: m.size_period_long,
};
// The steps of the guide's line, short, as the sentence says them.
const STEPS = {
  half: m.size_step_half,
  same: m.size_step_same,
  one_and_a_half: m.size_step_one_and_a_half,
  double: m.size_step_double,
  more: m.size_step_more,
} satisfies Record<ReturnType<typeof sizeStepsOf>[number], () => string>;

/** The hour of the forecast nearest now, whose swell the factor is read for. */
function hourNear(hours: readonly Hour[] | undefined, now: number) {
  let nearest: Hour | undefined;
  for (const hour of hours ?? []) {
    const away = Math.abs(new Date(hour.time).getTime() - now);
    if (!nearest || away < Math.abs(new Date(nearest.time).getTime() - now)) nearest = hour;
  }
  return nearest;
}

/** What the guide's line says, as the sentence says it: one step, or a range. */
export function saidOf(locals: readonly string[] | null | undefined) {
  const steps = sizeStepsOf(locals ?? []);
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return null;
  if (first !== last) return m.size_said_between({ from: STEPS[first](), to: STEPS[last]() });
  return first === "more" ? m.size_said_more() : m.size_said_one({ step: STEPS[first]() });
}

/** A sentence with one of its parts in the darker type. */
function emphasize(text: string, part: string): ReactNode {
  const at = text.indexOf(part);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-neutral-10">{part}</span>
      {text.slice(at + part.length)}
    </>
  );
}

export function SizeAgainstForecast({
  learned,
  locals,
  hours,
  now,
}: {
  // What the sessions say. Undefined while it is on its way.
  learned: SizeFactor | undefined;
  // What the guide's line says: the steps it holds.
  locals: readonly string[] | null | undefined;
  hours: readonly Hour[] | undefined;
  now: number;
}) {
  const hour = hourNear(hours, now);
  const of =
    learned &&
    factorFor(learned, {
      waveDirectionDegrees: hour?.waveDirectionDegrees ?? null,
      wavePeakPeriodSeconds: hour?.wavePeakPeriodSeconds ?? null,
    });
  const said = saidOf(locals);
  if (!of && !said) return null;

  const factor = of ? formatNumber(of.factor, 1) : "";
  return (
    <p className="px-xs text-s text-pretty text-neutral-7">
      {of &&
        (of.swell ? (
          <>
            {m.size_against_swell_before()}{" "}
            <Bearing
              degrees={SWELL_SECTORS.indexOf(of.swell.sector) * 45}
              named
              className="text-neutral-10"
            />{" "}
            {emphasize(
              m.size_against_swell_after({
                period: PERIODS[of.swell.period](),
                factor,
                count: of.sessions,
              }),
              factor,
            )}
          </>
        ) : (
          emphasize(m.size_against_learned({ factor, count: of.sessions }), factor)
        ))}
      {of && said && " "}
      {said && emphasize(m.size_against_locals({ said }), said)}
      {!of && said && <> {m.size_against_guide_note()}</>}
    </p>
  );
}
