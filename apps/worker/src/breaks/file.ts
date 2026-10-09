import {
  ABILITY_LEVELS,
  BOARD_TYPES,
  BOTTOM_TYPES,
  BREAK_TYPES,
  COMPASS_POINTS,
  SEASONS,
  TIDE_STAGES,
  WAVE_DIRECTIONS,
} from "@repo/db/schema/spots";

import { FormatError } from "../providers/format-error";
import { isPosition } from "../providers/plausible";
import type { BreakList, Characteristics, ListedBreak } from "./source";

const FILE_KEYS = ["provider", "license", "attribution", "breaks"];
const BREAK_KEYS = [
  "ref",
  "name",
  "latitude",
  "longitude",
  "url",
  "characteristics",
  "location",
  "timezone",
  "details",
];
// The characteristics that are lists of words, and the words each one takes.
const WORDS = {
  breakTypes: BREAK_TYPES,
  waveDirections: WAVE_DIRECTIONS,
  bottomTypes: BOTTOM_TYPES,
  abilityLevels: ABILITY_LEVELS,
  boardTypes: BOARD_TYPES,
  bestSeasons: SEASONS,
  bestTides: TIDE_STAGES,
  bestSwellDirections: COMPASS_POINTS,
  bestWindDirections: COMPASS_POINTS,
} satisfies { [Field in keyof Characteristics]: readonly string[] };
const CHARACTERISTIC_KEYS = [...Object.keys(WORDS), "offshoreDirectionDegrees"];
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_REF_LENGTH = 200;
const MAX_TEXT_LENGTH = 200;
const MAX_PLACES = 10;
// Deeper than any list's details, and far from what the programs that carry them can walk.
const MAX_DEPTH = 64;
// A file with a fault in every line would otherwise print them all.
const MAX_PROBLEMS_SHOWN = 20;

function refused(problems: string[]) {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN);
  if (problems.length > shown.length) shown.push(`and ${problems.length - shown.length} more`);
  return new FormatError({ provider: "breaks", message: shown.join("\n") });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebAddress(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:";
}

/** A short text with something in it and no space around. */
function isLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value === value.trim() &&
    value.length <= MAX_TEXT_LENGTH
  );
}

function isTimezone(value: unknown): value is string {
  if (!isLabel(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * What a line says the break is like, or its faults. A field takes the catalogue's own words
 * and no other: whoever writes the file translates a list's vocabulary into them.
 */
function readCharacteristics(given: unknown): Characteristics | string[] {
  if (!isRecord(given)) return ['"characteristics", when given, must be an object'];

  const faults: string[] = [];
  const read: Record<string, unknown> = {};
  for (const [field, words] of Object.entries(WORDS)) {
    const value = given[field];
    if (value === undefined) continue;
    const known: readonly unknown[] = words;
    const isList =
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((word) => known.includes(word)) &&
      new Set(value).size === value.length;
    if (isList) read[field] = value;
    else faults.push(`"${field}" must be a list of one or more of: ${words.join(", ")}`);
  }

  const degrees = given.offshoreDirectionDegrees;
  if (degrees !== undefined) {
    if (typeof degrees === "number" && Number.isInteger(degrees) && degrees >= 0 && degrees < 360) {
      read.offshoreDirectionDegrees = degrees;
    } else faults.push('"offshoreDirectionDegrees" must be a whole number from 0 to 359');
  }

  const unknown = unknownKeys(given, CHARACTERISTIC_KEYS);
  if (unknown.length > 0) faults.push(`unknown characteristics: ${unknown.join(", ")}`);
  return faults.length > 0 ? faults : read;
}

/**
 * Why the database would not hold the value as it is, or null when it would. Postgres stores
 * no text with U+0000, and half of a surrogate pair reaches it as another character.
 */
function unstorable(root: unknown) {
  const pending: [value: unknown, depth: number][] = [[root, 0]];

  for (let next = pending.pop(); next; next = pending.pop()) {
    const [value, depth] = next;
    if (typeof value === "string") {
      if (value.includes("\u0000")) return "a text holds the character U+0000";
      if (!value.isWellFormed()) return "a text holds half of a surrogate pair";
    } else if (typeof value === "object" && value !== null) {
      if (depth >= MAX_DEPTH) return `it is nested more than ${MAX_DEPTH} levels deep`;
      // The names of an object's fields are texts too.
      const items = Array.isArray(value) ? value : Object.entries(value).flat();
      for (const item of items) pending.push([item, depth + 1]);
    }
  }
  return null;
}

function unknownKeys(record: Record<string, unknown>, known: string[]) {
  return Object.keys(record).filter((key) => !known.includes(key));
}

/** One line of the file as a break, or its faults in words that name the field. */
function readBreak(line: Record<string, unknown>): ListedBreak | string[] {
  const { ref, name, latitude, longitude, url, location, timezone, details } = line;
  const faults: string[] = [];

  const hasRef =
    typeof ref === "string" && ref !== "" && ref === ref.trim() && ref.length <= MAX_REF_LENGTH;
  const hasName = isLabel(name);
  const hasPoint =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    isPosition(latitude, longitude);
  const hasUrl = url === undefined || isWebAddress(url);
  const hasLocation =
    location === undefined ||
    (Array.isArray(location) &&
      location.length > 0 &&
      location.length <= MAX_PLACES &&
      location.every(isLabel));
  const hasTimezone = timezone === undefined || isTimezone(timezone);
  // Left out, a break has no details. Null is not that: it is a value the format does not have.
  const hasDetails = details === undefined || isRecord(details);
  const characteristics =
    line.characteristics === undefined ? {} : readCharacteristics(line.characteristics);

  if (!hasRef) {
    faults.push(`"ref" must be a text of 1 to ${MAX_REF_LENGTH} characters, with no space around`);
  }
  if (!hasName) {
    faults.push(
      `"name" must be a text of 1 to ${MAX_TEXT_LENGTH} characters, with no space around`,
    );
  }
  if (!hasPoint) faults.push('"latitude" and "longitude" must be numbers on the globe');
  if (!hasUrl) faults.push('"url", when given, must be an http or https address');
  if (!hasLocation) {
    faults.push(`"location", when given, must be a list of 1 to ${MAX_PLACES} names of places`);
  }
  if (!hasTimezone) faults.push('"timezone", when given, must name a time zone, as "Europe/Paris"');
  if (!hasDetails) faults.push('"details", when given, must be an object');
  if (Array.isArray(characteristics)) faults.push(...characteristics);

  const unknown = unknownKeys(line, BREAK_KEYS);
  if (unknown.length > 0) faults.push(`unknown fields: ${unknown.join(", ")}`);
  const unstored = unstorable(line);
  if (unstored) faults.push(`${unstored}, which cannot be stored`);

  if (faults.length > 0 || Array.isArray(characteristics)) return faults;
  if (!hasRef || !hasName || !hasPoint || !hasUrl || !hasLocation || !hasTimezone || !hasDetails) {
    return faults;
  }
  return {
    ref,
    name,
    latitude,
    longitude,
    ...(url === undefined ? {} : { url }),
    ...(Object.keys(characteristics).length > 0 ? { characteristics } : {}),
    ...(location === undefined ? {} : { location }),
    ...(timezone === undefined ? {} : { timezone }),
    ...(details === undefined ? {} : { details }),
  };
}

/**
 * Reads the content of a file of breaks. Every line is checked, and one fault refuses the file:
 * nothing of a file is added unless all of it can be.
 */
export function parseBreaks(json: unknown): BreakList | FormatError {
  if (!isRecord(json)) return refused(["the file must hold one object"]);

  const { provider, license, attribution } = json;
  const lines = Array.isArray(json.breaks) ? json.breaks : [];
  const problems: string[] = [];

  const hasProvider = typeof provider === "string" && PROVIDER.test(provider);
  // Saying where the list comes from, and on what terms, is left to whoever writes the file.
  const hasLicense =
    license === undefined ||
    (isRecord(license) &&
      isLabel(license.type) &&
      isWebAddress(license.url) &&
      unknownKeys(license, ["type", "url"]).length === 0 &&
      unstorable(license) === null);
  const hasAttribution =
    attribution === undefined || (isLabel(attribution) && unstorable(attribution) === null);
  if (!hasProvider) problems.push('"provider" must be a short name in lower case, as "example"');
  if (!hasLicense) {
    problems.push(
      '"license", when given, must hold a "type" and the http or https "url" of its text',
    );
  }
  if (!hasAttribution) problems.push('"attribution", when given, must be a short text');
  if (lines.length === 0) problems.push('"breaks" must be a list of one break or more');
  const unknown = unknownKeys(json, FILE_KEYS);
  if (unknown.length > 0) problems.push(`unknown fields: ${unknown.join(", ")}`);

  const breaks: ListedBreak[] = [];
  const seen = new Set<string>();

  for (const [index, line] of lines.entries()) {
    const at = `break ${index + 1}`;
    if (!isRecord(line)) {
      problems.push(`${at}: must be an object`);
      continue;
    }

    const found = readBreak(line);
    if (Array.isArray(found)) {
      // The reference tells the operator which line it is, when the line has one.
      const named = typeof line.ref === "string" ? `${at} (${line.ref.slice(0, 40)})` : at;
      problems.push(...found.map((fault) => `${named}: ${fault}`));
    } else if (seen.has(found.ref)) {
      problems.push(`${at} (${found.ref.slice(0, 40)}): its reference is given twice`);
    } else {
      seen.add(found.ref);
      breaks.push(found);
    }
  }

  if (problems.length > 0 || !hasProvider || !hasLicense || !hasAttribution) {
    return refused(problems);
  }
  return {
    provider,
    ...(isRecord(license)
      ? { license: { type: String(license.type), url: String(license.url) } }
      : {}),
    ...(typeof attribution === "string" ? { attribution } : {}),
    breaks,
  };
}

/**
 * A number's size as its digits and its power of ten, so that 1.50, 15e-1 and 1.5 read the same.
 * The sign is left out: reading a number never changes it.
 */
function decimal(token: string) {
  const parts = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!parts) return null;

  const [, whole = "", fraction = "", power = "0"] = parts;
  const digits = (whole + fraction).replace(/^0+/, "");
  const significant = digits.replace(/0+$/, "");
  if (significant === "") return "0";
  const exponent = Number(power) - fraction.length + digits.length - significant.length;
  return `${significant}e${exponent}`;
}

/**
 * Reads the text of a file of breaks. A number that JavaScript cannot hold as it is
 * written, such as an integer past 2^53 or 1e400, refuses the file: it would be stored as
 * another number, or as none.
 */
export function readBreaks(text: string): BreakList | FormatError {
  const changed: string[] = [];
  let json: unknown;

  try {
    json = JSON.parse(text, (key, value: unknown, context?: { source?: string }) => {
      // Node hands over the number as the file wrote it. An infinite value has no digits to
      // compare, and neither has a number that came without its text: both are refused.
      const source = context?.source ?? "";
      if (typeof value === "number" && decimal(source) !== decimal(String(value))) {
        changed.push(`the number ${source.slice(0, 40)} of "${key}" cannot be read as it is`);
      }
      return value;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return refused([`the file is not JSON: ${reason}`]);
  }

  if (changed.length > 0) return refused(changed);
  return parseBreaks(json);
}
