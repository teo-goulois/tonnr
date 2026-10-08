import type { SpotCriteria } from "@repo/db/schema/spots";
import { Effect } from "effect";

import { FORECAST_SOURCE, getForecast } from "../forecasts/open-meteo";
import { predictTideTimeline } from "../tides/tide-prediction";
import { findWindows, unmetCriteria, type HourConditions } from "./criteria";

const HOUR_MS = 60 * 60 * 1000;

type AssessedSpot = { latitude: number; longitude: number; criteria: SpotCriteria };

/**
 * Hour by hour, the forecast and the tide at a spot, the criteria each hour does not meet, and
 * the windows during which the spot works. Null when the spot has no sea forecast.
 */
export const assessSpot = Effect.fn("assessSpot")(function* (spot: AssessedSpot, days: number) {
  const forecast = yield* getForecast({
    latitude: spot.latitude,
    longitude: spot.longitude,
    days,
  });
  const first = forecast?.hours[0]?.time;
  const last = forecast?.hours.at(-1)?.time;
  if (!forecast || !first || !last) return null;

  const tides = predictTideTimeline({
    latitude: spot.latitude,
    longitude: spot.longitude,
    start: first,
    // One hour more, to know whether the tide is still rising at the last hour.
    end: new Date(last.getTime() + HOUR_MS),
    stepMinutes: 60,
  });
  const tideAt = new Map(
    (tides?.timeline ?? []).map((point) => [point.time.getTime(), point.heightMeters]),
  );

  const hours = forecast.hours.map((hour) => {
    const height = tideAt.get(hour.time.getTime()) ?? null;
    const nextHeight = tideAt.get(hour.time.getTime() + HOUR_MS) ?? null;
    const tideTrend =
      height === null || nextHeight === null || nextHeight === height
        ? null
        : nextHeight > height
          ? ("rising" as const)
          : ("falling" as const);

    const conditions: HourConditions = {
      time: hour.time,
      swellHeightMeters: hour.swellHeightMeters,
      swellPeriodSeconds: hour.swellPeriodSeconds,
      swellDirectionDegrees: hour.swellDirectionDegrees,
      windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
      windDirectionDegrees: hour.windDirectionDegrees,
      tideHeightMeters: height,
      tideTrend,
    };
    return { ...conditions, unmet: unmetCriteria(conditions, spot.criteria) };
  });

  return {
    hours,
    windows: findWindows(hours),
    forecastSource: FORECAST_SOURCE,
    tideStation: tides ? { ...tides.station, datum: tides.datum } : null,
  };
});
