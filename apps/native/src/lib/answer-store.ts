import {
  type AsyncStorage,
  experimental_createQueryPersister,
} from "@tanstack/query-persist-client-core";
import {
  type Query,
  type QueryCache,
  type QueryFunctionContext,
  type QueryKey,
  notifyManager,
} from "@tanstack/react-query";
import { Paths } from "expo-file-system";
import { type SQLiteDatabase, openDatabaseAsync } from "expo-sqlite";

import {
  KEPT_FOR_MS,
  KEPT_MOST_CHARACTERS,
  KEPT_PREFIX,
  KEPT_VERSION,
  TIDE_PROCEDURES,
  deserializeAnswer,
  isKept,
  pointKey,
  procedureOf,
  queryHashOf,
  serializeAnswer,
  storedAs,
  tideWithin,
} from "./kept-answers";

// The answers of the API the app keeps on the phone, by the rules of `kept-answers.ts`: a database
// of its own in the phone's cache, which no backup takes and which the system may empty when it
// lacks room, as it may any cache. Each answer is written as it comes, and read back the first
// time a query asks for it after the app started, or after its query left the memory: a sheet
// opened where the network does not reach shows what was read last, and asks for a newer answer
// all the same. Decision 080.

const DATABASE = "kept-answers.db";
/** How many answers are written between two prunings, beside the one of each start. */
const PRUNE_EVERY = 25;

let opened: Promise<SQLiteDatabase> | undefined;
let queue: Promise<unknown> = Promise.resolve();
let written = 0;

function database() {
  opened ??= openDatabaseAsync(DATABASE, undefined, Paths.cache.uri).then(async (db) => {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS answer (
        key TEXT PRIMARY KEY NOT NULL,
        procedure TEXT NOT NULL,
        point TEXT,
        value TEXT NOT NULL,
        size INTEGER NOT NULL,
        written_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS answer_at_point ON answer (procedure, point, written_at);`,
    );
    return db;
  });
  // A database that could not be opened is tried again at the next step.
  opened.catch(() => {
    opened = undefined;
  });
  return opened;
}

/**
 * Runs a step on the database after every step asked before it, so that forgetting the answers
 * comes after each answer written before it was asked. A step that fails says so to its caller
 * alone.
 */
function inTurn<T>(step: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const next = queue.then(async () => step(await database()));
  queue = next.catch(() => undefined);
  return next;
}

/** Forgets the answers older than they are kept, then the oldest beyond the room they may take. */
function prune() {
  return inTurn(async (db) => {
    await db.runAsync("DELETE FROM answer WHERE written_at < ?", Date.now() - KEPT_FOR_MS);
    await db.runAsync(
      `DELETE FROM answer WHERE key IN (
        SELECT key FROM (
          SELECT key, SUM(size) OVER (ORDER BY written_at DESC, key) AS taken FROM answer
        ) WHERE taken > ?
      )`,
      KEPT_MOST_CHARACTERS,
    );
  }).catch(() => undefined);
}

/** Forgets every answer kept on the phone, as signing out does (decision 070). */
export function forgetKeptAnswers() {
  return inTurn((db) => db.runAsync("DELETE FROM answer")).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * The newest tide kept at the point a tide query asks for, cut to its span: the tide does not
 * change with the day it was asked, so the one read yesterday shows today's where the network
 * does not reach.
 */
async function tideKeptFor(queryKey: QueryKey): Promise<unknown> {
  const procedure = procedureOf(queryKey);
  if (procedure === undefined || !TIDE_PROCEDURES.has(procedure)) return undefined;
  const input = (
    queryKey[1] as
      | { input?: { latitude?: unknown; longitude?: unknown; start?: unknown; end?: unknown } }
      | undefined
  )?.input;
  if (
    typeof input?.latitude !== "number" ||
    typeof input.longitude !== "number" ||
    !(input.start instanceof Date) ||
    !(input.end instanceof Date)
  ) {
    return undefined;
  }
  const { start, end } = input;
  const rows = await inTurn((db) =>
    db.getAllAsync<{ value: string }>(
      `SELECT value FROM answer WHERE procedure = ? AND point = ?
        ORDER BY written_at DESC LIMIT 5`,
      procedure,
      pointKey(input.latitude as number, input.longitude as number),
    ),
  ).catch(() => []);
  for (const row of rows) {
    try {
      const kept = deserializeAnswer(row.value).state.data;
      const within =
        kept && typeof kept === "object"
          ? tideWithin(kept as Parameters<typeof tideWithin>[0], start, end)
          : undefined;
      if (within !== undefined) return within;
    } catch {
      // An answer that cannot be read is passed over: the store forgets it when it is asked.
    }
  }
  return undefined;
}

/**
 * What keeps the answers of a query client's cache, which the client is given as the persister
 * of its queries. An answer that comes for a query the cache let go of, as a sign-out empties it,
 * is not written.
 */
export function keepAnswers(cache: QueryCache) {
  const isLive = (queryHash: string) => cache.get(queryHash) !== undefined;
  // The store never fails a query: an answer it cannot read is none, and one it cannot write is
  // not kept.
  const storage: AsyncStorage<string> = {
    getItem: (key) =>
      inTurn((db) =>
        db.getFirstAsync<{ value: string }>("SELECT value FROM answer WHERE key = ?", key),
      ).then(
        (row) => row?.value ?? null,
        () => null,
      ),
    setItem: (key, value) => {
      const hash = queryHashOf(key);
      const stored = storedAs(key);
      if (hash === undefined || stored === undefined || !isLive(hash)) return undefined;
      return inTurn((db) =>
        db.runAsync(
          `INSERT OR REPLACE INTO answer (key, procedure, point, value, size, written_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
          key,
          stored.procedure,
          stored.point ?? null,
          value,
          value.length,
          Date.now(),
        ),
      ).then(
        () => {
          written += 1;
          if (written % PRUNE_EVERY === 0) void prune();
        },
        () => undefined,
      );
    },
    removeItem: (key) =>
      inTurn((db) => db.runAsync("DELETE FROM answer WHERE key = ?", key)).then(
        () => undefined,
        () => undefined,
      ),
  };

  const persister = experimental_createQueryPersister<string>({
    storage,
    buster: KEPT_VERSION,
    maxAge: KEPT_FOR_MS,
    prefix: KEPT_PREFIX,
    serialize: serializeAnswer,
    deserialize: deserializeAnswer,
    filters: { predicate: (query) => isKept(query.queryKey) },
    // The library asks for a newer answer with nothing to catch its failure, which is every one
    // where the network does not reach: it is asked below.
    refetchOnRestore: false,
  });

  // An answer the app changes itself, as a spot it saved or a list it emptied, is kept as it now
  // is, or a spot deleted here would come back where the network does not reach.
  cache.subscribe((event) => {
    if (
      event.type === "updated" &&
      event.action.type === "success" &&
      event.action.manual === true &&
      isKept(event.query.queryKey)
    ) {
      void persister.persistQuery(event.query);
    }
  });

  // The phone forgets, once each time the app starts, what is too old or takes too much room.
  void prune();

  return async function keptAnswer<T, TQueryKey extends QueryKey>(
    queryFn: (context: QueryFunctionContext<TQueryKey>) => T | Promise<T>,
    context: QueryFunctionContext<TQueryKey>,
    query: Query,
  ): Promise<T> {
    const restoring = query.state.data === undefined;
    let asked = false;
    try {
      const answer = await persister.persisterFn(
        (asking: QueryFunctionContext<TQueryKey>) => {
          asked = true;
          return queryFn(asking);
        },
        context,
        query,
      );
      // An answer read from the store is shown, and a newer one asked once the store has said
      // when it was read, as the library would ask it. A failure leaves the kept one in place.
      if (restoring && !asked) {
        notifyManager.schedule(() => {
          if (query.isStale()) query.fetch().catch(() => undefined);
        });
      }
      return answer;
    } catch (error) {
      const tide = await tideKeptFor(query.queryKey);
      if (tide !== undefined) return tide as T;
      throw error;
    }
  };
}
