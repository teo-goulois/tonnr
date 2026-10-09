import type { SpotCriteria } from "@repo/db/schema/spots";
import { Effect } from "effect";

import type { Forecasts } from "../forecasts/forecasts";
import { FORECAST_SOURCE } from "../forecasts/open-meteo";
import { predictTideExtremes, predictTideTimeline } from "../tides/tide-prediction";
import { findWindows, tideTrendAt, unmetCriteria, type HourConditions } from "./criteria";

const HOUR_MS = 60 * 60 * 1000;
// Longer than the wait between two tides anywhere, so the tide after the last hour is found.
const NEXT_TIDE_MARGIN_MS = 26 * HOUR_MS;

type AssessedSpot = { latitude: number; longitude: number; criteria: SpotCriteria };

/**
 * Hour by hour, the forecast and the tide at a spot, the criteria each hour does not meet, and
 * the windows during which the spot works. `hasSea` is false when the spot has no sea forecast,
 * and there is nothing else then. The forecast comes from the program's `forecasts`, and says
 * when it was fetched and whether it is an older one, given because the provider could not be
 * asked.
 */
export const assessSpot = Effect.fn("assessSpot")(function* (
  forecasts: Forecasts,
  spot: AssessedSpot,
  days: number,
) {
  const forecast = yield* forecasts.get({
    latitude: spot.latitude,
    longitude: spot.longitude,
    days,
  });
  const fetched = { forecastFetchedAt: forecast.fetchedAt, forecastStale: forecast.stale };
  const first = forecast.hours?.[0]?.time;
  const last = forecast.hours?.at(-1)?.time;
  if (!forecast.hours || !first || !last) return { hasSea: false as const, ...fetched };

  const point = { latitude: spot.latitude, longitude: spot.longitude };
  const tides = predictTideTimeline({ ...point, start: first, end: last, stepMinutes: 60 });
  const tideAt = new Map(
    (tides?.timeline ?? []).map((entry) => [entry.time.getTime(), entry.heightMeters]),
  );
  const extremes =
    predictTideExtremes({
      ...point,
      start: first,
      end: new Date(last.getTime() + NEXT_TIDE_MARGIN_MS),
    })?.extremes ?? [];

  const hours = forecast.hours.map((hour) => {
    const conditions: HourConditions = {
      time: hour.time,
      swellHeightMeters: hour.swellHeightMeters,
      swellPeriodSeconds: hour.swellPeriodSeconds,
      swellDirectionDegrees: hour.swellDirectionDegrees,
      windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
      windDirectionDegrees: hour.windDirectionDegrees,
      tideHeightMeters: tideAt.get(hour.time.getTime()) ?? null,
      tideTrend: tideTrendAt(hour.time, extremes),
    };
    return { ...conditions, unmet: unmetCriteria(conditions, spot.criteria) };
  });

  return {
    hasSea: true as const,
    hours,
    windows: findWindows(hours),
    forecastSource: FORECAST_SOURCE,
    ...fetched,
    tideStation: tides ? { ...tides.station, datum: tides.datum } : null,
  };
});
