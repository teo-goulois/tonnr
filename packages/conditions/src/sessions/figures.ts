import type { SessionConditions, SessionReading } from "@repo/db/schema/sessions";

import { type ShoreWind, shoreWind } from "../shore-wind";

// What a session's conditions come to, for a line of a logbook and for what an account likes at
// a place: decision 043. The functions here read no clock and no database.

/**
 * One figure for each thing the sea did during a session, read at its middle. Null is what
 * nothing gave. The waves, the wind and the weather are the models', as an alert reads them: the
 * buoy and the wind station stand beside them, as what was measured near the place.
 */
export type SessionFigures = {
  waveHeightMeters: number | null;
  // The period of the waves that carry the most energy, and the mean period of the whole sea.
  wavePeakPeriodSeconds: number | null;
  wavePeriodSeconds: number | null;
  waveDirectionDegrees: number | null;
  primarySwellHeightMeters: number | null;
  primarySwellDirectionDegrees: number | null;
  windSpeedMetersPerSecond: number | null;
  windGustMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  // How that wind met the shore, where the place says which way its shore faces.
  shoreWind: ShoreWind | null;
  airTemperatureCelsius: number | null;
  cloudCoverPercent: number | null;
  precipitationMillimeters: number | null;
  tideHeightMeters: number | null;
  tideTrend: "rising" | "falling" | null;
  // Where the tide stood between the low and the high around the session: 0 at the low, 1 at
  // the high.
  tideLevel: number | null;
  // What the nearest buoy measured nearest the middle of the session.
  buoy: {
    name: string;
    distanceKm: number;
    significantHeightMeters: number | null;
    periodSeconds: number | null;
    directionDegrees: number | null;
    waterTemperatureCelsius: number | null;
  } | null;
  // What the nearest wind station measured then.
  measuredWind: {
    name: string;
    distanceKm: number;
    speedMetersPerSecond: number | null;
    gustMetersPerSecond: number | null;
    directionDegrees: number | null;
  } | null;
};

type Sample = { at: number; value: number | null };

// A value at a moment, on the line between the two samples around it. Outside the samples it is
// the nearest one's. Null when a sample around the moment has none.
function between(samples: Sample[], at: number) {
  const after = samples.findIndex((sample) => sample.at >= at);
  if (after < 0) return samples.at(-1)?.value ?? null;
  const next = samples[after]!;
  const before = samples[after - 1];
  if (!before || next.at === at) return next.value;
  if (before.value === null || next.value === null) return null;
  const share = (at - before.at) / (next.at - before.at);
  return before.value + (next.value - before.value) * share;
}

// A bearing at a moment: the nearer sample's, since bearings do not average across north.
function nearest(samples: Sample[], at: number) {
  let found: Sample | undefined;
  for (const sample of samples) {
    if (!found || Math.abs(sample.at - at) < Math.abs(found.at - at)) found = sample;
  }
  return found?.value ?? null;
}

const round = (value: number | null, digits: number) =>
  value === null ? null : Number(value.toFixed(digits));

// The reading nearest a moment among those that measured something asked for.
function readingNear(
  readings: SessionReading[],
  at: number,
  measured: (reading: SessionReading) => boolean,
) {
  let found: SessionReading | undefined;
  for (const reading of readings) {
    if (!measured(reading)) continue;
    const away = Math.abs(Date.parse(reading.observedAt) - at);
    if (!found || away < Math.abs(Date.parse(found.observedAt) - at)) found = reading;
  }
  return found;
}

/** The figures of a session, from the conditions kept with it. */
export function sessionFigures(
  conditions: SessionConditions | null,
  startedAt: Date,
  durationMinutes: number,
): SessionFigures {
  const middle = startedAt.getTime() + (durationMinutes * 60 * 1000) / 2;
  const hours = conditions?.model?.hours ?? [];
  const lane = (value: (hour: (typeof hours)[number]) => number | null) =>
    hours.map((hour) => ({ at: Date.parse(hour.time), value: value(hour) }));
  const windFrom = nearest(
    lane((hour) => hour.windDirectionDegrees),
    middle,
  );
  const offshoreFrom = conditions?.offshoreDirectionDegrees ?? null;

  const tide = conditions?.tide ?? null;
  const tideHeight = tide
    ? between(
        tide.heights.map((height) => ({ at: Date.parse(height.time), value: height.heightMeters })),
        middle,
      )
    : null;
  // The tide runs from the last turn before the middle of the session to the next one.
  const turns = (tide?.extremes ?? []).map((turn) => ({ ...turn, at: Date.parse(turn.time) }));
  const next = turns.find((turn) => turn.at > middle);
  const last = turns.filter((turn) => turn.at <= middle).at(-1);
  const low = last?.type === "low" ? last : next?.type === "low" ? next : undefined;
  const high = last?.type === "high" ? last : next?.type === "high" ? next : undefined;
  const range = low && high ? high.heightMeters - low.heightMeters : 0;

  const buoy = conditions?.buoy ?? null;
  const waves = buoy
    ? readingNear(buoy.readings, middle, (reading) => reading.significantHeightMeters !== null)
    : undefined;
  const wind = conditions?.wind ?? null;
  const blown = wind
    ? readingNear(wind.readings, middle, (reading) => reading.windSpeedMetersPerSecond !== null)
    : undefined;

  return {
    waveHeightMeters: round(
      between(
        lane((hour) => hour.waveHeightMeters),
        middle,
      ),
      2,
    ),
    wavePeakPeriodSeconds: round(
      between(
        lane((hour) => hour.wavePeakPeriodSeconds),
        middle,
      ),
      1,
    ),
    wavePeriodSeconds: round(
      between(
        lane((hour) => hour.wavePeriodSeconds),
        middle,
      ),
      1,
    ),
    waveDirectionDegrees: nearest(
      lane((hour) => hour.waveDirectionDegrees),
      middle,
    ),
    primarySwellHeightMeters: round(
      between(
        lane((hour) => hour.primarySwellHeightMeters),
        middle,
      ),
      2,
    ),
    primarySwellDirectionDegrees: nearest(
      lane((hour) => hour.primarySwellDirectionDegrees),
      middle,
    ),
    windSpeedMetersPerSecond: round(
      between(
        lane((hour) => hour.windSpeedMetersPerSecond),
        middle,
      ),
      1,
    ),
    windGustMetersPerSecond: round(
      between(
        lane((hour) => hour.windGustMetersPerSecond),
        middle,
      ),
      1,
    ),
    windDirectionDegrees: windFrom,
    shoreWind:
      windFrom !== null && offshoreFrom !== null ? shoreWind(windFrom, offshoreFrom) : null,
    airTemperatureCelsius: round(
      between(
        lane((hour) => hour.airTemperatureCelsius),
        middle,
      ),
      1,
    ),
    cloudCoverPercent: round(
      between(
        lane((hour) => hour.cloudCoverPercent),
        middle,
      ),
      0,
    ),
    precipitationMillimeters: round(
      between(
        lane((hour) => hour.precipitationMillimeters),
        middle,
      ),
      1,
    ),
    tideHeightMeters: round(tideHeight, 2),
    tideTrend: next ? (next.type === "high" ? "rising" : "falling") : null,
    tideLevel:
      tideHeight !== null && low && range > 0
        ? Number(Math.min(1, Math.max(0, (tideHeight - low.heightMeters) / range)).toFixed(2))
        : null,
    buoy:
      buoy && waves
        ? {
            name: buoy.name,
            distanceKm: buoy.distanceKm,
            significantHeightMeters: waves.significantHeightMeters,
            periodSeconds: waves.peakPeriodSeconds ?? waves.meanPeriodSeconds,
            directionDegrees: waves.peakDirectionDegrees,
            waterTemperatureCelsius:
              readingNear(
                buoy.readings,
                middle,
                (reading) => reading.waterTemperatureCelsius !== null,
              )?.waterTemperatureCelsius ?? null,
          }
        : null,
    measuredWind:
      wind && blown
        ? {
            name: wind.name,
            distanceKm: wind.distanceKm,
            speedMetersPerSecond: blown.windSpeedMetersPerSecond,
            gustMetersPerSecond: blown.windGustMetersPerSecond,
            directionDegrees: blown.windDirectionDegrees,
          }
        : null,
  };
}

/** The hours a session spans, for what reads the models: from its start to its end. */
export function sessionSpan(startedAt: Date, durationMinutes: number) {
  return { from: startedAt, until: new Date(startedAt.getTime() + durationMinutes * 60 * 1000) };
}
