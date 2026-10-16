import type { SurfSize } from "@repo/db/schema/sessions";

import type { SessionFigures } from "./figures";
import { SURF_FACES } from "./sizes";

// How many times the height of the forecast the waves of a break run, read from the sessions
// surfed there, of every account: decision 062. The functions here read no clock and no database,
// and what they are given of an account is a key that tells one from another, never answered.

// Fewer sessions than this, or sessions of fewer accounts, say nothing yet.
export const FACTOR_SESSIONS = 5;
export const FACTOR_ACCOUNTS = 2;
// A model's height under this is a flat sea, and the ratio says nothing, in metres.
export const FACTOR_MODEL_LEAST = 0.2;

/** The eight sectors a swell comes from, 45 degrees each, centred on the points of the compass. */
export const SWELL_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type SwellSector = (typeof SWELL_SECTORS)[number];

/** The three bands of period: under 9 s, 9 to 13 s, and 13 s and over. */
export const PERIOD_BANDS = ["short", "medium", "long"] as const;
export type PeriodBand = (typeof PERIOD_BANDS)[number];
const MEDIUM_FROM = 9;
const LONG_FROM = 13;

/** What a session gives: who surfed it, how big the waves looked, and what the model said. */
export type SizedSession = {
  account: string;
  waveSize: SurfSize | null;
  figures: Pick<
    SessionFigures,
    "waveHeightMeters" | "wavePeakPeriodSeconds" | "waveDirectionDegrees"
  >;
};

/** A swell's own factor: the sessions of one sector and one band, when they are enough. */
export type SwellFactor = {
  sector: SwellSector;
  period: PeriodBand;
  factor: number;
  sessions: number;
};

/** What the sessions of a break say. `factor` is null while they are too few. */
export type SizeFactor = {
  // The sessions that gave a ratio: a size said, and a model's height worth reading.
  sessions: number;
  factor: number | null;
  bySwell: SwellFactor[];
};

/** The sector a bearing falls in, from where the swell comes. */
export function sectorOf(degrees: number): SwellSector {
  const turned = ((degrees % 360) + 360) % 360;
  return SWELL_SECTORS[Math.round(turned / 45) % 8]!;
}

/** The band a period falls in. */
export function periodBandOf(seconds: number): PeriodBand {
  if (seconds >= LONG_FROM) return "long";
  if (seconds >= MEDIUM_FROM) return "medium";
  return "short";
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const tenth = (value: number) => Number(value.toFixed(1));

type Ratio = {
  account: string;
  ratio: number;
  sector: SwellSector | null;
  period: PeriodBand | null;
};

const ratioOf = (session: SizedSession): Ratio | null => {
  const height = session.figures.waveHeightMeters;
  if (session.waveSize === null || height === null || height < FACTOR_MODEL_LEAST) return null;
  const { waveDirectionDegrees: direction, wavePeakPeriodSeconds: period } = session.figures;
  return {
    account: session.account,
    ratio: SURF_FACES[session.waveSize].drawn / height,
    sector: direction === null ? null : sectorOf(direction),
    period: period === null ? null : periodBandOf(period),
  };
};

const enough = (ratios: Ratio[]) =>
  ratios.length >= FACTOR_SESSIONS &&
  new Set(ratios.map((one) => one.account)).size >= FACTOR_ACCOUNTS;

/**
 * The factor of a break: the median of the ratios of the face each size stands for over the
 * model's height, to the tenth, once enough sessions of enough accounts gave one. A sector and a
 * band that hold enough of them have a factor of their own, from them alone.
 */
export function sizeFactor(sessions: SizedSession[]): SizeFactor {
  const ratios = sessions.map(ratioOf).filter((one): one is Ratio => one !== null);
  if (!enough(ratios)) return { sessions: ratios.length, factor: null, bySwell: [] };
  const bySwell: SwellFactor[] = [];
  for (const sector of SWELL_SECTORS) {
    for (const period of PERIOD_BANDS) {
      const own = ratios.filter((one) => one.sector === sector && one.period === period);
      if (!enough(own)) continue;
      bySwell.push({
        sector,
        period,
        factor: tenth(median(own.map((one) => one.ratio))),
        sessions: own.length,
      });
    }
  }
  return {
    sessions: ratios.length,
    factor: tenth(median(ratios.map((one) => one.ratio))),
    bySwell,
  };
}

/** What a swell of the hour reads as: its own factor when there is one, the break's otherwise. */
export type HourFactor = {
  factor: number;
  sessions: number;
  // Set when the factor is the swell's own.
  swell: { sector: SwellSector; period: PeriodBand } | null;
};

/** The factor to read an hour of the forecast with. Null while the break has none. */
export function factorFor(
  learned: SizeFactor,
  hour: { waveDirectionDegrees: number | null; wavePeakPeriodSeconds: number | null },
): HourFactor | null {
  if (learned.factor === null) return null;
  const { waveDirectionDegrees: direction, wavePeakPeriodSeconds: period } = hour;
  if (direction !== null && period !== null) {
    const sector = sectorOf(direction);
    const band = periodBandOf(period);
    const own = learned.bySwell.find((one) => one.sector === sector && one.period === band);
    if (own) return { factor: own.factor, sessions: own.sessions, swell: { sector, period: band } };
  }
  return { factor: learned.factor, sessions: learned.sessions, swell: null };
}
