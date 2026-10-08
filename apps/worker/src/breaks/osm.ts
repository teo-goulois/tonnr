import { fetchJsonOnce } from "@repo/upstream";
import { Effect } from "effect";

import { cleanText } from "../clean-text";
import { FormatError } from "../providers/format-error";
import { isPosition } from "../providers/plausible";
import type { BreakList, BreakSource, ListedBreak } from "./source";

// Every object tagged for surfing, with its tags. A line or an area comes with the centre of
// the box around it, which for a long beach can lie a few hundred metres from the peak.
// Overpass gives up after 25 seconds, before the request itself times out.
const QUERY = '[out:json][timeout:25];nwr["sport"="surfing"];out tags center;';
const OVERPASS_URL = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(QUERY)}`;

// The longest name the API accepts for a spot.
const MAX_NAME_LENGTH = 80;

// OpenStreetMap tags surf shops, schools and clubs for surfing too. An object with one of these
// keys is a business or a building, not a place in the water.
const BUSINESS_KEYS = [
  "shop",
  "amenity",
  "office",
  "club",
  "craft",
  "building",
  "healthcare",
  "brand",
  "school",
  // A ride at a fair or a slide at a pool.
  "attraction",
];
// Ways to reach an owner. A beach can have a website. A bare point that has one is a business.
// An address or opening hours prove nothing: mappers give them to beaches and car parks too.
const CONTACT_KEYS = [
  "operator",
  "website",
  "contact:website",
  "phone",
  "contact:phone",
  "email",
  "contact:email",
];
const SHORE = ["beach", "reef", "bay", "cape", "shoal", "sand", "coastline", "peninsula"];
// A beach or a stretch of water is often drawn as one of these. Any other leisure or tourism
// value is a facility: a sports centre, a wave pool, a holiday camp.
const OPEN_AIR_LEISURE = [
  "pitch",
  "swimming_area",
  "park",
  "beach_resort",
  "nature_reserve",
  "surfing",
  "sport",
];
const OPEN_AIR_TOURISM = ["attraction", "viewpoint", "yes"];
// River waves, lakes and pools. The forecast is a sea forecast, so an alert there never fires.
const INLAND_KEYS = ["waterway", "whitewater", "playspot", "water"];

// Words that name a business, a river wave or another sport, in the languages seen in the data.
const NOT_A_BREAK =
  /school|schule|[ée]cole|escuela|escola|scuola|club|klub|camp\b|camping|cent(er|re|ro)\b|shop|\bbrand\b|rental|verleih|hostel|(surf|guest) ?house|lodge|kite|wind ?surf|water ?sports?|stand ?up|\bsup\b|paddle ?(surf|board)|wake ?(board|park|surf)|verein|association|welle\b|river ?(surf|wave)|whitewater|wave ?(pool|park|garden)|\bwave$|flow ?rider/i;
// A name that says what the object is and not which one.
const GENERIC_NAME =
  /^(the )?(spot de surf|surf(ing)? ?spot|surf ?break|surf|surfing|surf beach)$/i;
// What a description says of a business.
const SELLS_SOMETHING = /rental|lesson|verleih|kurse?\b|location de|cours de/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Whether the tags of an object tagged for surfing describe a place where the sea is surfed. */
export function isSurfBreak(tags: Record<string, unknown>) {
  if (BUSINESS_KEYS.some((key) => key in tags)) return false;
  if ("leisure" in tags && !OPEN_AIR_LEISURE.includes(String(tags.leisure))) return false;
  if ("tourism" in tags && !OPEN_AIR_TOURISM.includes(String(tags.tourism))) return false;
  if (INLAND_KEYS.some((key) => key in tags) || tags.natural === "water") return false;
  if (tags.fee === "yes") return false;

  if (!SHORE.includes(String(tags.natural))) {
    if (CONTACT_KEYS.some((key) => key in tags)) return false;
    if (typeof tags.description === "string" && SELLS_SOMETHING.test(tags.description)) {
      return false;
    }
  }

  const name = typeof tags.name === "string" ? cleanText(tags.name) : "";
  return name !== "" && !NOT_A_BREAK.test(name) && !GENERIC_NAME.test(name);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

/** Reads an Overpass answer and keeps the objects that are surf breaks. */
export function parseSurfingObjects(json: unknown): BreakList | FormatError {
  if (!isRecord(json) || !Array.isArray(json.elements)) {
    return new FormatError({ provider: "osm", message: "the answer has no list of objects" });
  }
  // Overpass answers 200 with what it had found when it ran out of time or memory. Such a
  // list is short of breaks, and whoever stores it would take them for gone.
  if (typeof json.remark === "string") {
    return new FormatError({ provider: "osm", message: `Overpass gave up: ${json.remark}` });
  }

  const breaks: ListedBreak[] = [];
  const unreadable: string[] = [];

  for (const element of json.elements) {
    if (!isRecord(element) || !isRecord(element.tags)) continue;
    if (!isSurfBreak(element.tags)) continue;

    const { type, id } = element;
    // Without a reference there is nothing to call it by, here or in the catalogue.
    if ((type !== "node" && type !== "way" && type !== "relation") || typeof id !== "number") {
      continue;
    }
    const ref = `${type}/${id}`;

    // A node carries its position, a line or an area the centre Overpass computed.
    const point = isRecord(element.center) ? element.center : element;
    const latitude = numberOrNull(point.lat);
    const longitude = numberOrNull(point.lon);
    const name = cleanText(String(element.tags.name));
    if (
      latitude === null ||
      longitude === null ||
      !isPosition(latitude, longitude) ||
      name.length > MAX_NAME_LENGTH
    ) {
      unreadable.push(ref);
      continue;
    }

    breaks.push({ ref, name, latitude, longitude, url: `https://www.openstreetmap.org/${ref}` });
  }

  return { breaks, unreadable };
}

export const osm: BreakSource = {
  id: "osm",
  // Once a week: mappers add a few breaks a month, and the public Overpass servers are shared.
  schedule: "37 4 * * 1",
  licenseType: "ODbL-1.0",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  attribution: "(c) OpenStreetMap contributors <https://www.openstreetmap.org/copyright>",
  // One request, with no second try: Overpass asks a refused caller to wait half a minute.
  fetchBreaks: Effect.gen(function* () {
    const list = parseSurfingObjects(yield* fetchJsonOnce(OVERPASS_URL));
    if (list instanceof FormatError) return yield* list;
    return list;
  }),
};
