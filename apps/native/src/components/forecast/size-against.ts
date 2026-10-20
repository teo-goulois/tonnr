import type { Forecast, SurfBreak } from "@repo/client/viewer/types";

import { m } from "@/paraglide/messages";

// What the sentence of a break's size against the forecast reads: the hour of the forecast
// nearest now, and what the guide's line says, in the steps of the catalogue's words. The web's
// `size-against-forecast.tsx` and `break-characteristics.tsx` say the same. Decision 062.

type Hour = Forecast["hours"][number];
/** A step of the guide's line `sizeFactors`, as the API answers it. */
export type SizeStep = NonNullable<SurfBreak["characteristics"]["sizeFactors"]>[number];

// The catalogue's steps, in their order: `SIZE_FACTORS` of packages/db, which the app does not
// import.
const STEPS = [
  "half",
  "same",
  "one_and_a_half",
  "double",
  "more",
] as const satisfies readonly SizeStep[];

// The steps, short, as the sentence says them.
const STEP_WORDS: Record<SizeStep, () => string> = {
  half: m.size_step_half,
  same: m.size_step_same,
  one_and_a_half: m.size_step_one_and_a_half,
  double: m.size_step_double,
  more: m.size_step_more,
};

/** The hour of the forecast nearest now, whose swell the factor is read for. */
export function hourNear(hours: readonly Hour[] | undefined, now: number) {
  let nearest: Hour | undefined;
  for (const hour of hours ?? []) {
    const away = Math.abs(new Date(hour.time).getTime() - now);
    if (!nearest || away < Math.abs(new Date(nearest.time).getTime() - now)) nearest = hour;
  }
  return nearest;
}

/** The steps of the size against the forecast, in their order, that a list of words holds. */
export function sizeStepsOf(given: readonly string[]): SizeStep[] {
  return STEPS.filter((step) => given.includes(step));
}

/** What the guide's line says, as the sentence says it: one step, or a range. */
export function saidOf(locals: readonly string[] | null | undefined) {
  const steps = sizeStepsOf(locals ?? []);
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return null;
  if (first !== last) {
    return m.size_said_between({ from: STEP_WORDS[first](), to: STEP_WORDS[last]() });
  }
  return first === "more" ? m.size_said_more() : m.size_said_one({ step: STEP_WORDS[first]() });
}
