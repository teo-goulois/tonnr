import { fetchJsonOnce, type UpstreamError } from "@repo/upstream";
import type { Locale } from "@repo/config/locales";
import { Effect, Result, Schema } from "effect";
import { z } from "zod";

import { hasControlCharacter } from "./text";

// Photon's public service. It asks to be used fairly and promises nothing, so an instance may
// name a Photon of its own in PLACES_URL. Decision 030.
const PUBLIC_SERVICE = "https://photon.komoot.io";

/** Whose places these are, as an answer says it: Photon serves OpenStreetMap's. */
export const PLACES_SOURCE = {
  name: "OpenStreetMap",
  url: "https://www.openstreetmap.org/copyright",
  attribution: "(c) OpenStreetMap contributors",
  license: {
    type: "ODbL-1.0",
    url: "https://opendatacommons.org/licenses/odbl/1-0/",
    commercialUse: true,
  },
};

const MINUTE_MS = 60 * 1000;
// What the service is asked in a minute, by one account and by everyone. A search that follows
// the keys is a few requests for one name: this is room to type, and no room to collect. The
// counts are this process's: an instance that runs two APIs asks twice as much.
const ACCOUNT_REQUESTS = 40;
const ALL_REQUESTS = 240;
// How many searches wait for the service at once. A service that is slow is not asked more.
const AT_ONCE = 8;
// After the service refused or failed, it is left alone this long.
const REST_MS = 30 * 1000;
// An answer is kept this long, for the same search asked again, and so many of them at most.
const KEPT_MS = 10 * MINUTE_MS;
const KEPT_ANSWERS = 500;
// What the service is asked for: towns, their parts, and what has a name on the ground, a beach
// or a headland. Streets and houses are left out: a street named after a town came before the
// town, and a spot is not put on the map from a shop's address.
const LAYERS = ["city", "district", "locality", "county", "state", "country", "other"];
// The service is asked for twice the places wanted, since it gives some of them twice.
const ASKED_MOST = 20;

export type Place = {
  name: string;
  // The places it lies in, from the widest to the nearest, as a break's are.
  location: string[];
  latitude: number;
  longitude: number;
};

export type PlaceSearch = {
  query: string;
  // Where the map is, so that the places near it are brought forward, and how close it is, as
  // its zoom: the closer the map, the smaller the stretch of coast that counts as near.
  near?: { latitude: number; longitude: number; zoom?: number | undefined } | undefined;
  locale?: Locale | undefined;
  limit: number;
};

/** Nothing is asked of the service for now. */
export class PlacesBusy extends Schema.TaggedError<PlacesBusy>()("PlacesBusy", {
  // True when this account asked all it may. False when everyone did, or when the service is
  // slow or was just refused: the account can do nothing about it.
  byAccount: Schema.Boolean,
  retryAfterSeconds: Schema.Int,
}) {}

/** The service did not give a list of places. */
export class PlacesFailed extends Schema.TaggedError<PlacesFailed>()("PlacesFailed", {
  // What the service answered with. None when it did not answer, or answered something else
  // than a list of places.
  status: Schema.optional(Schema.Int),
  // How long the service is now left alone. None after a search it called wrong.
  retryAfterSeconds: Schema.optional(Schema.Int),
}) {}

const text = z.string().trim().min(1).optional().catch(undefined);
const featureSchema = z.object({
  geometry: z.object({
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  properties: z.object({
    name: text,
    housenumber: text,
    street: text,
    locality: text,
    district: text,
    city: text,
    county: text,
    state: text,
    country: text,
  }),
});
const answerSchema = z.object({ features: z.array(z.unknown()) });

/**
 * Reads Photon's answer, a GeoJSON collection, up to `limit` places. A feature that cannot be
 * read is left out, and so is one that has no name of any kind. A place said twice in the same
 * words, as the two banks of a stream are, is given once. Null when the document is not such a
 * collection.
 */
export function readPlaces(document: unknown, limit = Number.POSITIVE_INFINITY): Place[] | null {
  const answer = answerSchema.safeParse(document);
  if (!answer.success) return null;

  const places: Place[] = [];
  const said = new Set<string>();
  for (const feature of answer.data.features) {
    if (places.length >= limit) break;
    const read = featureSchema.safeParse(feature);
    if (!read.success) continue;
    const { name, housenumber, street, ...around } = read.data.properties;
    // From the nearest to the widest. A name of OpenStreetMap is anyone's to write.
    const within = [
      around.locality,
      around.district,
      around.city,
      around.county,
      around.state,
      around.country,
    ].filter((part): part is string => part !== undefined && !hasControlCharacter(part));
    // An address has no name of its own: its street stands for it, then the place it is in.
    const address = street && [housenumber, street].filter(Boolean).join(" ");
    const label = [name, address].find((part) => part && !hasControlCharacter(part));
    const called = label ?? within.shift();
    if (!called) continue;

    // A town in a county of its name is said once.
    const location = within
      .filter((part, index) => part !== called && within.indexOf(part) === index)
      .reverse();
    const words = [called, ...location].join("\n");
    if (said.has(words)) continue;
    said.add(words);

    const [longitude, latitude] = read.data.geometry.coordinates;
    places.push({ name: called, location, latitude, longitude });
  }
  return places;
}

const PHOTON_LANGUAGES = new Set<Locale>(["en", "fr"]);

// The map's middle to a tenth of a degree: near enough to rank by, and the same for every search
// made from one stretch of coast.
const rounded = (degrees: number) => Math.round(degrees * 10) / 10;

function addressOf(service: string, search: PlaceSearch) {
  const address = new URL("api", service.endsWith("/") ? service : `${service}/`);
  address.searchParams.set("q", search.query);
  address.searchParams.set("limit", String(Math.min(ASKED_MOST, search.limit * 2)));
  for (const layer of LAYERS) address.searchParams.append("layer", layer);
  // Photon writes names in these languages alone, and refuses another: a place is then named
  // in its own.
  if (search.locale && PHOTON_LANGUAGES.has(search.locale)) {
    address.searchParams.set("lang", search.locale);
  }
  if (search.near) {
    address.searchParams.set("lat", String(rounded(search.near.latitude)));
    address.searchParams.set("lon", String(rounded(search.near.longitude)));
    if (search.near.zoom !== undefined) {
      address.searchParams.set("zoom", String(Math.round(search.near.zoom)));
    }
  }
  return address.toString();
}

type Ask = (address: string) => Effect.Effect<unknown, UpstreamError>;

/**
 * The search of places by name, which finds a point of the map from an address. It asks the
 * instance's Photon, once for a search, within what an account and everyone may ask in a
 * minute, and keeps an answer a few minutes in memory. Nothing of a search is stored or logged.
 */
export function createPlaces(
  settings: { PLACES_URL?: string | undefined },
  ask: Ask = fetchJsonOnce,
  // What the limits, the rest and the kept answers are timed by, in milliseconds: time since the
  // process started, which never goes back. The clock of the day can be set back by hours, and
  // would then keep an account that had asked too much waiting for as long.
  clock: () => number = () => performance.now(),
) {
  const service = settings.PLACES_URL ?? PUBLIC_SERVICE;
  const kept = new Map<string, { places: Place[]; until: number }>();
  // The minute the counts are of. It only goes forward: a clock that did go back would start
  // no count again.
  let minute = 0;
  let asked = 0;
  const askedBy = new Map<string, number>();
  let waiting = 0;
  let restUntil = 0;

  const search = Effect.fn("searchPlaces")(function* (wanted: PlaceSearch, accountId: string) {
    const now = clock();
    // A search is known by the address it asks: what is kept is what that address answered.
    const address = addressOf(service, {
      ...wanted,
      query: wanted.query.trim().replace(/\s+/g, " "),
    });
    const known = kept.get(address);
    if (known && known.until > now) return known.places;

    const busy = (byAccount: boolean, untilMs: number) =>
      new PlacesBusy({
        byAccount,
        retryAfterSeconds: Math.max(1, Math.ceil((untilMs - now) / 1000)),
      });
    const current = Math.floor(now / MINUTE_MS);
    if (current > minute) {
      minute = current;
      asked = 0;
      askedBy.clear();
    }
    const nextMinute = (minute + 1) * MINUTE_MS;
    // The account's own limit comes first: it is told that it asked too much, whatever else
    // is true.
    const byAccount = askedBy.get(accountId) ?? 0;
    if (byAccount >= ACCOUNT_REQUESTS) return yield* busy(true, nextMinute);
    if (restUntil > now) return yield* busy(false, restUntil);
    if (waiting >= AT_ONCE) return yield* busy(false, now + 1000);
    if (asked >= ALL_REQUESTS) return yield* busy(false, nextMinute);
    // A request that fails was made all the same, and counts.
    asked += 1;
    askedBy.set(accountId, byAccount + 1);

    waiting += 1;
    const answered = yield* Effect.result(ask(address)).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          waiting -= 1;
        }),
      ),
    );
    // The service rests from the moment it failed, which may be long after it was asked, and
    // a failure that comes late never shortens a rest that began after it.
    const rest = () => {
      const ended = clock();
      restUntil = Math.max(restUntil, ended + REST_MS);
      return Math.ceil((restUntil - ended) / 1000);
    };
    if (Result.isFailure(answered)) {
      const { status } = answered.failure;
      // A search the service calls wrong is that search's own fault, and the next is another.
      // Anything else says that the service is down, or wants fewer callers.
      return yield* new PlacesFailed({
        status,
        retryAfterSeconds: status === 400 ? undefined : rest(),
      });
    }
    const places = readPlaces(answered.success, wanted.limit);
    if (!places) return yield* new PlacesFailed({ retryAfterSeconds: rest() });

    kept.delete(address);
    kept.set(address, { places, until: clock() + KEPT_MS });
    // The oldest goes first: a map keeps its entries in the order they were set.
    for (const oldest of kept.keys()) {
      if (kept.size <= KEPT_ANSWERS) break;
      kept.delete(oldest);
    }
    return places;
  });

  return { search };
}

export type Places = ReturnType<typeof createPlaces>;
