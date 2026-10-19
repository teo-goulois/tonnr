import { LOCALES } from "@repo/config/locales";
import { ORPCError } from "@orpc/server";
import { hourOf } from "@repo/conditions/forecasts/week";
import { JUDGED, type SeaWords, verdictOf } from "@repo/conditions/sea-now";
import { SHORE_WINDS } from "@repo/conditions/shore-wind";
import type { Database } from "@repo/db";
import { station } from "@repo/db/schema/buoys";
import { stationListMember, stationListSpot } from "@repo/db/schema/lists";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, eq, exists, inArray, or, type SQL, sql } from "drizzle-orm";
import { Effect, Result } from "effect";
import { z } from "zod";

import { describeCharacteristics } from "../characteristics";
import { admitForecastQuestion } from "../forecast-callers";
import { confirmedWordsOf } from "../guides";
import { type Caller, callerProcedure, protectedProcedure } from "../index";
import { hoursAhead, nearestStation, nextTides, windAtShore } from "../pages";
import { PLACES_SOURCE } from "../places";
import { hasControlCharacter } from "../text";
import { breakSchema, describeBreak } from "./breaks";
import { forecastSourceSchema } from "./forecasts";
import { describeReading, describeStation, readingSchema, stationSchema } from "./stations";
import { tideStationSchema } from "./tides";

// A number as JSON gives it, or as a query string writes it. Nothing else is read as one: `null`
// is not zero, and `true` is not one. The reference then shows the number and its bounds.
const NUMBER = /^-?\d+(\.\d+)?$/;
const numeric = <Checked extends z.ZodType<number>>(checked: Checked) =>
  z.preprocess(
    (given) => (typeof given === "string" && NUMBER.test(given.trim()) ? Number(given) : given),
    checked,
  );

const placeSchema = z.object({
  name: z.string(),
  // The places it lies in, from the widest to the nearest.
  location: z.array(z.string()),
  latitude: z.number(),
  longitude: z.number(),
});

// The sea at a few places at once, for what a phone shows outside its app: its widgets, and a
// session as it begins. Everything is read from what the instance keeps, and nothing is asked
// of a provider: decision 074.

/** How many places one call names, breaks, stations and spots together. Decision 074. */
export const PLACES_AT_ONCE = 12;
/** How far ahead the hours of the forecast reach, and the tides. */
export const HOURS_AHEAD = 48;

// Ids as a list, or as one text with commas between them, as a query string writes them
// shortly: `breakIds=a,b`. The reference then shows the list.
const idsSchema = z
  .preprocess(
    (given) =>
      typeof given === "string"
        ? given
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id !== "")
        : given,
    // A station's id is its network's name and the network's own id for it: room for both.
    z.array(z.string().min(1).max(128)).max(PLACES_AT_ONCE),
  )
  .optional();

const measurement = z.number().nullable();

// An hour of the forecast as a widget draws it: the sea, its period and where it comes from, and
// the wind with how it meets the shore.
const hourAheadSchema = z.object({
  time: z.date(),
  // The whole sea, swell and wind sea together, as a buoy measures it.
  waveHeightMeters: measurement,
  wavePeriodSeconds: measurement,
  // Null at every hour when the model gives none: the mean period then stands for it.
  wavePeakPeriodSeconds: measurement,
  waveDirectionDegrees: measurement,
  windSpeedMetersPerSecond: measurement,
  windGustMetersPerSecond: measurement,
  windDirectionDegrees: measurement,
  // How the wind meets the shore, where the place knows its offshore direction.
  atShore: z.enum(SHORE_WINDS).nullable(),
});

const nearStationSchema = stationSchema.extend({
  latestReading: readingSchema,
  distanceKm: z.number(),
});

const pointFields = {
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
};

// What the place is: a break of the catalogue with where it was read, a station with its
// network and its licence, or a spot of an account's own, which names no one.
const seaPlaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("break"), ...pointFields, source: breakSchema.shape.source }),
  stationSchema.extend({ kind: z.literal("station") }),
  z.object({ kind: z.literal("spot"), ...pointFields }),
]);

const seaNowSchema = z.object({
  place: seaPlaceSchema,
  // The hours of the forecast kept for the place's cell, from the hour now to 48 hours after
  // it. Null when nobody asked for the cell in the day, or when the place has no sea in it: the
  // buoy, the wind station and the tide still say the sea.
  forecast: z
    .object({
      hours: z.array(hourAheadSchema),
      // What fits the place's own words at the hour now, and what does not, as the sentence of
      // its panel lays them (decision 061). Null at a station, which has no words, and when the
      // kept forecast has no hour now. Empty lists where the words judge nothing.
      verdict: z.object({ fits: z.array(z.enum(JUDGED)), off: z.array(z.enum(JUDGED)) }).nullable(),
      // When the instance fetched the forecast. It is not when the model ran.
      fetchedAt: z.date(),
      // True for a forecast over two hours old, which no question since has fetched again.
      stale: z.boolean(),
      source: forecastSourceSchema,
    })
    .nullable(),
  // The nearest buoy and the nearest wind station that measured within a day, each with its
  // latest reading and when it was observed. A station is its own nearest while it measures.
  waves: nearStationSchema.nullable(),
  wind: nearStationSchema
    .extend({
      // How the measured wind meets the shore, where the place knows its offshore direction.
      atShore: z.enum(SHORE_WINDS).nullable(),
    })
    .nullable(),
  // The highs and the lows of the next 48 hours, and the height now with the way the tide
  // goes, computed for the nearest tide station. Null far from any.
  tide: z
    .object({
      station: tideStationSchema,
      datum: z.string(),
      now: z.object({ heightMeters: z.number(), trend: z.enum(["rising", "falling"]) }).nullable(),
      extremes: z.array(
        z.object({ time: z.date(), type: z.enum(["high", "low"]), heightMeters: z.number() }),
      ),
    })
    .nullable(),
});

/** The ids once each, in the order they were first given. */
const once = (ids: readonly string[] | undefined) => [...new Set(ids ?? [])];

/** The rows of some ids, in the order of the ids: those that were found. */
function inOrder<Row extends { id: string }>(ids: string[], rows: Row[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Of some spots, those the caller reads: an account its own and those of a list it kept,
 * whoever has a list's link that list's, and a key or a visitor none. Decision 035.
 */
function readableSpots(db: Database, caller: Caller, ids: string[]) {
  if (ids.length === 0) return [];
  // The spot is in one of these lists.
  const inLists = (lists: SQL) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(stationListSpot)
        .where(and(eq(stationListSpot.spotId, spot.id), lists)),
    );
  const readable =
    caller.via === "session"
      ? or(
          eq(spot.userId, caller.userId),
          inLists(
            inArray(
              stationListSpot.listId,
              db
                .select({ listId: stationListMember.listId })
                .from(stationListMember)
                .where(eq(stationListMember.userId, caller.userId)),
            ),
          ),
        )
      : caller.via === "link"
        ? inLists(eq(stationListSpot.listId, caller.listId))
        : null;
  if (!readable) return [];
  return db
    .select()
    .from(spot)
    .where(and(inArray(spot.id, ids), readable));
}

type SeaPlace = z.infer<typeof seaPlaceSchema>;

/** What the sea does at a place, from what is kept: what `seaNowSchema` says. */
async function seaAt(
  context: { db: Database; forecasts: Parameters<typeof hoursAhead>[0] },
  place: SeaPlace,
  // What the place says of itself, which the hour now is judged by. Null at a station.
  words: SeaWords | null,
  now: Date,
) {
  const offshore = words?.offshoreDirectionDegrees ?? null;
  const [waves, wind, ahead] = await Promise.all([
    nearestStation(context.db, place, "waves", now),
    nearestStation(context.db, place, "wind", now),
    hoursAhead(context.forecasts, place, now, HOURS_AHEAD),
  ]);
  const tide = nextTides(place, now, HOURS_AHEAD);
  const hourNow = ahead && hourOf(ahead.hours, now);
  return {
    place,
    forecast: ahead && {
      hours: ahead.hours.map((hour) => ({
        time: hour.time,
        waveHeightMeters: hour.waveHeightMeters,
        wavePeriodSeconds: hour.wavePeriodSeconds,
        wavePeakPeriodSeconds: hour.wavePeakPeriodSeconds,
        waveDirectionDegrees: hour.waveDirectionDegrees,
        windSpeedMetersPerSecond: hour.windSpeedMetersPerSecond,
        windGustMetersPerSecond: hour.windGustMetersPerSecond,
        windDirectionDegrees: hour.windDirectionDegrees,
        atShore: windAtShore(hour.windDirectionDegrees, offshore),
      })),
      verdict: words && hourNow ? verdictOf(words, hourNow, tide) : null,
      fetchedAt: ahead.fetchedAt,
      stale: ahead.stale,
      source: ahead.source,
    },
    waves: waves && {
      ...describeStation(waves.station),
      latestReading: describeReading(waves.reading),
      distanceKm: Math.round(waves.distanceKm * 10) / 10,
    },
    wind: wind && {
      ...describeStation(wind.station),
      latestReading: describeReading(wind.reading),
      distanceKm: Math.round(wind.distanceKm * 10) / 10,
      atShore: windAtShore(wind.reading.windDirectionDeg, offshore),
    },
    tide: tide && {
      station: tide.station,
      datum: tide.datum,
      now: tide.now,
      extremes: tide.extremes.map(({ time, type, heightMeters }) => ({ time, type, heightMeters })),
    },
  };
}

export const placesRouter = {
  // An account's and not a key's: the search is a tool to place a spot, and the places are a
  // service's that the instance asks, not data it holds. Decision 030.
  search: protectedProcedure
    .meta({ analytics: "place_searched" })
    .route({
      method: "GET",
      path: "/places",
      summary: "Places by their name, to find a point of the map",
      description:
        "Towns, their parts, and what OpenStreetMap names on the ground, a beach or a headland, " +
        "whose name matches. Streets and houses are left out. Given together, `latitude` and " +
        "`longitude` bring forward the places near that point, and `zoom` says how wide near " +
        "is: the zoom of the map the search is made from. The " +
        "instance asks a search service for them and keeps nothing of a search. An account " +
        "may search so many times a minute: beyond, the answer is 429. It is 503 when the " +
        "service fails and while it is then left alone. Both say in `Retry-After` when to " +
        "ask again.",
      tags: ["Places"],
    })
    .input(
      z
        .object({
          // Part of the name, as the catalogue of breaks takes it.
          q: z
            .string()
            .trim()
            .min(2)
            .max(120)
            .refine((q) => !hasControlCharacter(q), "must not contain control characters"),
          latitude: numeric(z.number().min(-90).max(90)).optional(),
          longitude: numeric(z.number().min(-180).max(180)).optional(),
          // How close the map is, as its zoom. It says how wide "near" is.
          zoom: numeric(z.number().min(0).max(22)).optional(),
          // The language the names are wanted in, where a place has one in it.
          locale: z.enum(LOCALES).optional(),
          limit: numeric(z.number().int().min(1).max(10)).default(5),
        })
        .refine(
          (input) => (input.latitude === undefined) === (input.longitude === undefined),
          "latitude and longitude go together",
        ),
    )
    .output(
      z.object({
        places: z.array(placeSchema),
        source: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
      }),
    )
    .handler(async ({ input, context }) => {
      const { q, latitude, longitude, zoom, locale, limit } = input;
      const near =
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude, zoom }
          : undefined;
      const result = await Effect.runPromise(
        Effect.result(
          context.places.search({ query: q, near, locale, limit }, context.session.user.id),
        ),
      );
      if (Result.isSuccess(result)) return { places: result.success, source: PLACES_SOURCE };

      const failure = result.failure;
      if (failure._tag === "PlacesBusy") {
        context.reply.retryAfterSeconds = failure.retryAfterSeconds;
        throw failure.byAccount
          ? new ORPCError("TOO_MANY_REQUESTS", {
              message: "Too many searches for now. Try again in a moment.",
            })
          : new ORPCError("SERVICE_UNAVAILABLE", {
              message: "The search of places is resting. Try again in a moment.",
            });
      }
      // The address that was asked holds what the caller typed: the log gets the status alone.
      console.error(`places: the search service answered ${failure.status ?? "no list of places"}`);
      // A search the service called wrong starts no rest: the next one may be made at once.
      context.reply.retryAfterSeconds = failure.retryAfterSeconds ?? 0;
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "The search of places did not answer. Try again in a moment.",
      });
    }),

  // What a break or a station is like at sea is everyone's, as at `forecasts.get` and on a
  // break's page: a key and a visitor read it here too. A spot is answered to whoever reads it
  // elsewhere, and is otherwise missing. Not a tool of the MCP server. Decision 074.
  now: callerProcedure
    .route({
      method: "GET",
      path: "/places/now",
      summary: "The sea now and in the next two days at a few places, from what is kept",
      description:
        "For a phone's widgets, at breaks of the catalogue (`breakIds`), stations " +
        "(`stationIds`) and spots (`spotIds`), each a list or ids between commas, " +
        `${PLACES_AT_ONCE} places at most in all. Each place has the hours of the forecast the ` +
        `instance keeps for its cell, from the hour now to ${HOURS_AHEAD} hours after it, with ` +
        "how each hour's wind meets the shore and what fits the place's own words at the hour " +
        "now, the nearest buoy and wind station that measured within a day with their latest " +
        `reading, and the highs and lows of the next ${HOURS_AHEAD} hours with the tide now. ` +
        "Each says when it was read and whose it is. Nothing here asks the forecast provider: " +
        "a place whose cell nobody asked for in the day has no `forecast`. A spot is answered " +
        "to its owner, to an account that kept a list that holds it, and to whoever calls with " +
        "that list's link. A place that does not exist, and a spot the caller does not read, " +
        "are left out. A call counts as one forecast question of the caller's hour, however " +
        "many places it names: nothing keeps its answer in front of a phone, and a widget that " +
        "asks in a loop is stopped where a forecast would be.",
      tags: ["Places"],
    })
    .input(
      z
        .object({ breakIds: idsSchema, stationIds: idsSchema, spotIds: idsSchema })
        .refine((input) => {
          const named =
            (input.breakIds?.length ?? 0) +
            (input.stationIds?.length ?? 0) +
            (input.spotIds?.length ?? 0);
          return named >= 1 && named <= PLACES_AT_ONCE;
        }, `name between 1 and ${PLACES_AT_ONCE} places`),
    )
    .output(
      z.object({
        // The moment the answer was made, which the tide now and the hour now are read at.
        at: z.date(),
        // The breaks first, then the stations, then the spots, each in the order they were
        // named, and each once.
        places: z.array(seaNowSchema),
      }),
    )
    .handler(async ({ input, context }) => {
      const breakIds = once(input.breakIds);
      const stationIds = once(input.stationIds);
      const spotIds = once(input.spotIds);
      // One question of the caller's hour, though it asks the provider nothing: see above.
      await admitForecastQuestion(context);

      const { db } = context;
      const [breaks, stations, spots, confirmed] = await Promise.all([
        breakIds.length > 0
          ? db.select().from(surfBreak).where(inArray(surfBreak.id, breakIds))
          : [],
        stationIds.length > 0
          ? db.select().from(station).where(inArray(station.id, stationIds))
          : [],
        readableSpots(db, context.caller, spotIds),
        // What accounts confirmed of a break is read over it, as on its page.
        confirmedWordsOf(db, breakIds),
      ]);
      const now = new Date();
      const places: { place: SeaPlace; words: SeaWords | null }[] = [
        ...inOrder(breakIds, breaks).map((row) => {
          const described = describeBreak(row, confirmed.get(row.id));
          const { id, name, latitude, longitude, source, characteristics } = described;
          return {
            place: { kind: "break" as const, id, name, latitude, longitude, source },
            words: characteristics,
          };
        }),
        ...inOrder(stationIds, stations).map((row) => ({
          place: { kind: "station" as const, ...describeStation(row) },
          words: null,
        })),
        ...inOrder(spotIds, spots).map((row) => ({
          place: {
            kind: "spot" as const,
            id: row.id,
            name: row.name,
            latitude: row.latitude,
            longitude: row.longitude,
          },
          // What its owner said of it, and nothing of the break it was made from.
          words: describeCharacteristics(row.characteristics),
        })),
      ];
      return {
        at: now,
        places: await Promise.all(
          places.map(({ place, words }) => seaAt(context, place, words, now)),
        ),
      };
    }),
};
