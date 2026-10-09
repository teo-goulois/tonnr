import { FormatError } from "../providers/format-error";
import { isPosition } from "../providers/plausible";

/** A break as a file for the private list gives it. */
export type PrivateBreak = {
  // The break's identifier at the provider.
  ref: string;
  name: string;
  latitude: number;
  longitude: number;
  // The provider's page that shows the break.
  url: string;
  // When the provider was read.
  collectedAt: Date;
  // What else the provider says of the break. It is stored as it is.
  details: Record<string, unknown>;
};

export type PrivateBreakList = {
  provider: string;
  // The provider's terms, which the breaks fall under.
  termsUrl: string;
  breaks: PrivateBreak[];
};

const FILE_KEYS = ["provider", "termsUrl", "breaks"];
const BREAK_KEYS = ["ref", "name", "latitude", "longitude", "url", "collectedAt", "details"];
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A date and a time with their offset, so that the instant is not left to the reader's clock.
// No finer than a millisecond: that is what the import carries to the database.
const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
// Nobody read a provider's site before 1970, and the database takes no instant from the year
// 10000 on. The offset can move an instant written in 9999 past that.
const FIRST_INSTANT = Date.UTC(1970, 0, 1);
const END_OF_INSTANTS = Date.UTC(10000, 0, 1);
const MAX_REF_LENGTH = 200;
// Deeper than any provider's answer, and far from what the programs that carry it can walk.
const MAX_DEPTH = 64;
// A file with a fault in every line would otherwise print them all.
const MAX_PROBLEMS_SHOWN = 20;

function refused(problems: string[]) {
  const shown = problems.slice(0, MAX_PROBLEMS_SHOWN);
  if (problems.length > shown.length) shown.push(`and ${problems.length - shown.length} more`);
  return new FormatError({ provider: "private-breaks", message: shown.join("\n") });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebAddress(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:";
}

/** Whether the text names an instant that exists, and that the list can hold. */
function isInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = INSTANT.exec(value);
  if (!parts) return false;

  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts
    .slice(1, 7)
    .map(Number);
  // A day that does not exist, such as 30 February, comes back as another one.
  const built = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const instant = Date.parse(value);
  return (
    built.toISOString().slice(0, 19) === value.slice(0, 19) &&
    instant >= FIRST_INSTANT &&
    instant < END_OF_INSTANTS
  );
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
function readBreak(line: Record<string, unknown>): PrivateBreak | string[] {
  const { ref, name, latitude, longitude, url, collectedAt } = line;
  // Left out, a break has no details. Null is not that: it is a value the format does not have.
  const details = line.details === undefined ? {} : line.details;
  const faults: string[] = [];

  const hasRef =
    typeof ref === "string" && ref !== "" && ref === ref.trim() && ref.length <= MAX_REF_LENGTH;
  const hasName = typeof name === "string" && name.trim() !== "";
  const hasPoint =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    isPosition(latitude, longitude);
  const hasUrl = isWebAddress(url);
  const hasInstant = isInstant(collectedAt);
  const hasDetails = isRecord(details);

  if (!hasRef) {
    faults.push(`"ref" must be a text of 1 to ${MAX_REF_LENGTH} characters, with no space around`);
  }
  if (!hasName) faults.push('"name" must be a text');
  if (!hasPoint) faults.push('"latitude" and "longitude" must be numbers on the globe');
  if (!hasUrl) faults.push('"url" must be an http or https address');
  if (!hasInstant) {
    faults.push(
      '"collectedAt" must be a date and time that exist, with their offset and no finer than a millisecond, as 2026-10-08T10:00:00Z',
    );
  }
  if (!hasDetails) faults.push('"details" must be an object');

  const unknown = unknownKeys(line, BREAK_KEYS);
  if (unknown.length > 0) faults.push(`unknown fields: ${unknown.join(", ")}`);
  const unstored = unstorable(line);
  if (unstored) faults.push(`${unstored}, which cannot be stored`);

  if (faults.length > 0) return faults;
  if (!hasRef || !hasName || !hasPoint || !hasUrl || !hasInstant || !hasDetails) return faults;
  return { ref, name, latitude, longitude, url, collectedAt: new Date(collectedAt), details };
}

/**
 * Reads the content of a file for the private list. Every line is checked, and one fault
 * refuses the file: nothing of a file is stored unless all of it can be.
 */
export function parsePrivateBreaks(json: unknown): PrivateBreakList | FormatError {
  if (!isRecord(json)) return refused(["the file must hold one object"]);

  const { provider, termsUrl } = json;
  const lines = Array.isArray(json.breaks) ? json.breaks : [];
  const problems: string[] = [];

  const hasProvider = typeof provider === "string" && PROVIDER.test(provider);
  const hasTerms = isWebAddress(termsUrl) && unstorable(termsUrl) === null;
  if (!hasProvider) problems.push('"provider" must be a short name in lower case, as "example"');
  if (!hasTerms) problems.push('"termsUrl" must be an http or https address');
  if (lines.length === 0) problems.push('"breaks" must be a list of one break or more');
  const unknown = unknownKeys(json, FILE_KEYS);
  if (unknown.length > 0) problems.push(`unknown fields: ${unknown.join(", ")}`);

  const breaks: PrivateBreak[] = [];
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

  if (problems.length > 0 || !hasProvider || !hasTerms) return refused(problems);
  return { provider, termsUrl, breaks };
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
 * Reads the text of a file for the private list. A number that JavaScript cannot hold as it is
 * written, such as an integer past 2^53 or 1e400, refuses the file: it would be stored as
 * another number, or as none.
 */
export function readPrivateBreaks(text: string): PrivateBreakList | FormatError {
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
  return parsePrivateBreaks(json);
}
