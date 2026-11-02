import { ORPCError } from "@orpc/client";
import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import type { AppRouterClient } from "@repo/api/routers/index";
import type { PersistedQuery } from "@tanstack/query-persist-client-core";
import type { QueryKey } from "@tanstack/react-query";

// What the app keeps on the phone of what the API answered, so that a place shows what was read
// last where the network does not reach, until a newer answer takes its place: the rules, which
// read no clock and no database. `answer-store.ts` keeps them. Decision 080.

type V1 = AppRouterClient["v1"];
/** A procedure of the API as its query's key names it, such as `v1.forecasts.get`. */
type Procedure = {
  [Group in keyof V1 & string]: `v1.${Group}.${keyof V1[Group] & string}`;
}[keyof V1 & string];

/**
 * The procedures whose answers are kept: what the sea does at a place, the places themselves, and
 * the account's spots and lists, which lead to them. Nothing else of the account is kept, and
 * nothing that changes with what is typed.
 */
export const KEPT_PROCEDURES: ReadonlySet<string> = new Set<Procedure>([
  "v1.forecasts.get",
  "v1.tides.timeline",
  "v1.tides.extremes",
  "v1.stations.list",
  "v1.stations.get",
  "v1.stations.readings",
  "v1.breaks.list",
  "v1.breaks.get",
  "v1.breaks.sizeFactor",
  "v1.guides.get",
  "v1.spots.list",
  "v1.spots.get",
  "v1.lists.list",
  "v1.lists.view",
]);

/** A tide is the same whatever day it was asked for: one kept at a point stands for another span. */
export const TIDE_PROCEDURES: ReadonlySet<string> = new Set<Procedure>([
  "v1.tides.timeline",
  "v1.tides.extremes",
]);

/** How long an answer is kept: the forecast's week. */
export const KEPT_FOR_MS = 7 * 24 * 60 * 60 * 1000;
/** The most the answers take on the phone, the newest kept first. */
export const KEPT_MOST_CHARACTERS = 32 * 1024 * 1024;
/**
 * Changed when the app reads an answer that one kept by an older version could not give, which
 * the phone then forgets: the API's version adds to what it answers and never takes away
 * (decision 003), so a version of the app that only reads more of what v1 answers keeps it.
 */
export const KEPT_VERSION = "1";
/** What names an answer in the store, before the query's own hash. */
export const KEPT_PREFIX = "answer";

/** The procedure a query asks, as `v1.forecasts.get`, from the key oRPC gives it. */
export function procedureOf(queryKey: QueryKey): string | undefined {
  const path = queryKey[0];
  return Array.isArray(path) && path.every((part) => typeof part === "string")
    ? path.join(".")
    : undefined;
}

/** Whether a query's answer is kept on the phone. */
export function isKept(queryKey: QueryKey): boolean {
  const procedure = procedureOf(queryKey);
  return procedure !== undefined && KEPT_PROCEDURES.has(procedure);
}

/** A point as the store writes it, which two answers asked at the same place share. */
export function pointKey(latitude: number, longitude: number) {
  return `${latitude},${longitude}`;
}

/** What the store reads in an answer's name: its procedure, and the point it was asked at. */
export function storedAs(
  storageKey: string,
): { procedure: string; point: string | undefined } | undefined {
  const hash = queryHashOf(storageKey);
  if (hash === undefined) return undefined;
  let key: unknown;
  try {
    key = JSON.parse(hash);
  } catch {
    return undefined;
  }
  if (!Array.isArray(key)) return undefined;
  const procedure = procedureOf(key);
  if (procedure === undefined) return undefined;
  const input = (key[1] as { input?: { latitude?: unknown; longitude?: unknown } } | undefined)
    ?.input;
  const point =
    typeof input?.latitude === "number" && typeof input.longitude === "number"
      ? pointKey(input.latitude, input.longitude)
      : undefined;
  return { procedure, point };
}

/** The hash of the query an answer was kept for, from its name in the store. */
export function queryHashOf(storageKey: string): string | undefined {
  return storageKey.startsWith(`${KEPT_PREFIX}-`)
    ? storageKey.slice(KEPT_PREFIX.length + 1)
    : undefined;
}

// The API's answers hold dates, which JSON would turn into text: they are kept as oRPC's own
// transport writes them, with what says which value was a date.
const serializer = new StandardRPCJsonSerializer();

/** An answer as the store keeps it. */
export function serializeAnswer(answer: PersistedQuery): string {
  const [json, meta] = serializer.serialize(answer);
  return JSON.stringify({ json, meta });
}

/** An answer as the store gave it back, with its dates. */
export function deserializeAnswer(text: string): PersistedQuery {
  const { json, meta } = JSON.parse(text) as { json: unknown; meta: never };
  return serializer.deserialize(json, meta) as PersistedQuery;
}

type Timed = { time: Date };

/**
 * A tide kept for another span, cut to the span asked: its heights or its highs and lows
 * between `start` and `end`. None when nothing of it falls there.
 */
export function tideWithin<Answer extends { timeline?: Timed[]; extremes?: Timed[] }>(
  answer: Answer,
  start: Date,
  end: Date,
): Answer | undefined {
  const within = (time: Date) =>
    time.getTime() >= start.getTime() && time.getTime() <= end.getTime();
  if (answer.timeline) {
    const timeline = answer.timeline.filter((step) => within(step.time));
    return timeline.length > 0 ? { ...answer, timeline } : undefined;
  }
  if (answer.extremes) {
    const extremes = answer.extremes.filter((extreme) => within(extreme.time));
    return extremes.length > 0 ? { ...answer, extremes } : undefined;
  }
  return undefined;
}

/** The code of the API's refusal, as "NOT_FOUND". */
export function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Whether what a query asked for is not there to show: it failed with nothing in hand, or the API
 * said that it is gone. An answer the network could not read again stands until then.
 */
export function isGone(query: { isError: boolean; data: unknown; error: unknown }): boolean {
  return query.isError && (query.data === undefined || codeOf(query.error) === "NOT_FOUND");
}

/**
 * Why an answer in hand could not be read again: the network did not answer, or the API did and
 * refused. None while it was read again, or never tried.
 */
export function whyNotRefreshed(query: {
  isRefetchError: boolean;
  error: unknown;
}): "offline" | "refused" | undefined {
  if (!query.isRefetchError) return undefined;
  return query.error instanceof ORPCError ? "refused" : "offline";
}
