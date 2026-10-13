import type { Forecasts } from "@repo/conditions/forecasts/forecasts";
import { MAX_PAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { sessionSpan } from "@repo/conditions/sessions/figures";
import { tideOver } from "@repo/conditions/sessions/tide";
import type { Database } from "@repo/db";
import { reading, station } from "@repo/db/schema/buoys";
import type { SessionConditions, SessionStation } from "@repo/db/schema/sessions";
import { and, asc, between, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { Effect, Result } from "effect";

import { inBbox } from "./bbox";

// What the sea did while a session lasted, read once and kept with it: decision 043. The models
// are asked through the forecasts of the program, the tide is computed, and the stations are
// read in the database.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// A buoy speaks for the sea at a place when it is this near, as "it is on" reads it (decision
// 031), and a station for its wind when it is this near, as a break's panel reads it.
const BUOY_KM = 60;
const WIND_KM = 30;
// Among the stations near enough, the nearest few are asked for their readings.
const STATIONS_ASKED = 5;
// A station is read from a little before the session to a little after it, and no more
// readings than this are kept of it.
const AROUND_MS = 60 * MINUTE_MS;
const READINGS_MOST = 24;
const EARTH_KM = 6371;
const KM_PER_DEGREE = 111.2;
// Days that are no longer kept cost a request to the provider each time they are read. An
// account has them read this many times an hour, so that no one spends the day's requests by
// writing sessions and deleting them.
const PAST_READS_AN_HOUR = 20;

type Place = { latitude: number; longitude: number };

function distanceKm(one: Place, other: Place) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(other.latitude - one.latitude) / 2) ** 2 +
    Math.cos(radians(one.latitude)) *
      Math.cos(radians(other.latitude)) *
      Math.sin(radians(other.longitude - one.longitude) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

// The box that holds every point within a distance of a place, as "west,south,east,north": its
// west is east of its east when it crosses the antimeridian, and it is every longitude near a
// pole. The distance itself is checked afterwards.
function boxAround(place: Place, km: number): [number, number, number, number] {
  const latitudes = km / KM_PER_DEGREE;
  const farthest = Math.min(90, Math.abs(place.latitude) + latitudes);
  const width = latitudes / Math.cos((farthest * Math.PI) / 180);
  const south = Math.max(-90, place.latitude - latitudes);
  const north = Math.min(90, place.latitude + latitudes);
  if (farthest >= 90 || width >= 180) return [-180, south, 180, north];
  const turned = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;
  return [turned(place.longitude - width), south, turned(place.longitude + width), north];
}

/**
 * The nearest station that measured the waves, or the wind, while a span of time lasted, with
 * what it measured then. Null when none near did.
 */
async function stationOver(
  db: Database,
  place: Place,
  span: { from: Date; until: Date },
  measures: "waves" | "wind",
): Promise<SessionStation | null> {
  const km = measures === "waves" ? BUOY_KM : WIND_KM;
  const near = await db
    .select({
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      attribution: station.attribution,
    })
    .from(station)
    .where(
      and(
        measures === "waves"
          ? and(
              eq(station.reportsWaves, true),
              // A station that is not known to be sheltered: open, or not told yet (decision 011).
              or(isNull(station.exposure), ne(station.exposure, "sheltered")),
            )
          : eq(station.reportsWind, true),
        inBbox(station.latitude, station.longitude, boxAround(place, km)),
      ),
    );
  const nearest = near
    .map((one) => ({ ...one, distanceKm: distanceKm(place, one) }))
    .filter((one) => one.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, STATIONS_ASKED);

  for (const one of nearest) {
    const rows = await db
      .select()
      .from(reading)
      .where(
        and(
          eq(reading.stationId, one.id),
          isNotNull(measures === "waves" ? reading.significantHeightM : reading.windSpeedMs),
          between(
            reading.observedAt,
            new Date(span.from.getTime() - AROUND_MS),
            new Date(span.until.getTime() + AROUND_MS),
          ),
        ),
      )
      .orderBy(asc(reading.observedAt))
      .limit(READINGS_MOST);
    if (rows.length === 0) continue;
    return {
      stationId: one.id,
      name: one.name,
      distanceKm: Math.round(one.distanceKm * 10) / 10,
      attribution: one.attribution,
      readings: rows.map((row) => ({
        observedAt: row.observedAt.toISOString(),
        significantHeightMeters: row.significantHeightM,
        maxHeightMeters: row.maxHeightM,
        peakPeriodSeconds: row.peakPeriodS,
        meanPeriodSeconds: row.meanPeriodS,
        peakDirectionDegrees: row.peakDirectionDeg,
        waterTemperatureCelsius: row.waterTemperatureC,
        windSpeedMetersPerSecond: row.windSpeedMs,
        windGustMetersPerSecond: row.windGustMs,
        windDirectionDegrees: row.windDirectionDeg,
      })),
    };
  }
  return null;
}

// When each account last had days of the past read, in this program's memory.
const pastReads = new Map<string, number[]>();

/** Whether an account may have days of the past read once more now, which counts it. */
function spendsPastRead(userId: string, now: number) {
  const recent = (pastReads.get(userId) ?? []).filter((at) => now - at < 60 * MINUTE_MS);
  if (recent.length >= PAST_READS_AN_HOUR) {
    pastReads.set(userId, recent);
    return false;
  }
  pastReads.set(userId, [...recent, now]);
  return true;
}

/** Forgets what was counted, for a test that starts over. */
export function forgetPastReads() {
  pastReads.clear();
}

type Asked = {
  db: Database;
  forecasts: Forecasts;
  userId: string;
  place: Place;
  // Where the wind comes from when it blows off the shore there, when the place says.
  offshoreDirectionDegrees: number | null;
  startedAt: Date;
  durationMinutes: number;
};

/**
 * Everything that is known of the sea at a place while a session lasted: what the models last
 * computed of its hours, the tide, and what the nearest buoy and the nearest wind station
 * measured. A part that could not be had is null, and the rest is kept: a session is written
 * whatever the provider does.
 */
export async function takeConditions({
  db,
  forecasts,
  userId,
  place,
  offshoreDirectionDegrees,
  startedAt,
  durationMinutes,
}: Asked): Promise<SessionConditions> {
  const span = sessionSpan(startedAt, durationMinutes);
  const now = Date.now();
  // Hours that the forecast in force no longer holds are asked of the provider by themselves.
  const keptFrom = Math.floor(now / DAY_MS) * DAY_MS - MAX_PAST_DAYS * DAY_MS;
  const isPast = Math.floor(startedAt.getTime() / (60 * MINUTE_MS)) * 60 * MINUTE_MS < keptFrom;

  let model: SessionConditions["model"] = null;
  let modelMissing: SessionConditions["modelMissing"] = null;
  if (isPast && !spendsPastRead(userId, now)) {
    modelMissing = "unavailable";
  } else {
    const asked = await Effect.runPromise(Effect.result(forecasts.over({ ...place, ...span })));
    if (Result.isFailure(asked)) {
      modelMissing = asked.failure._tag === "ForecastTooOld" ? "too_old" : "unavailable";
      if (modelMissing === "unavailable") {
        console.error(`sessions: the models could not be asked (${asked.failure._tag})`);
      }
    } else if (!asked.success.hours) {
      modelMissing = "no_sea";
    } else {
      model = {
        point: asked.success.point,
        waveModels: asked.success.models.map((one) => one.id),
        swellModels: asked.success.swellModels.map((one) => one.id),
        hours: asked.success.hours.map((hour) => ({ ...hour, time: hour.time.toISOString() })),
      };
    }
  }

  const [buoy, wind] = await Promise.all([
    stationOver(db, place, span, "waves"),
    stationOver(db, place, span, "wind"),
  ]);
  return {
    model,
    modelMissing,
    tide: tideOver(place, span.from, span.until),
    buoy,
    wind,
    offshoreDirectionDegrees,
  };
}
