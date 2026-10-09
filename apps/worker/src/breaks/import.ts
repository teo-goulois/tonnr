import type { Database } from "@repo/db";
import { spot, surfBreak, surfBreakRecord } from "@repo/db/schema/spots";
import { count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "../store";
import { osm } from "./osm";
import type { BreakList, BreakSource } from "./source";

export const breakSources: readonly BreakSource[] = [osm];

// A break takes some twenty parameters, and Postgres accepts 65,535 in a statement.
const BREAKS_PER_STATEMENT = 1000;
// What a list says besides can weigh several kilobytes a break.
const RECORDS_PER_STATEMENT = 500;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const failed = (cause: unknown) => new StoreError({ provider: "breaks", cause });

// What the work throws once it has counted, so that the database undoes what it wrote.
class Undone<Report> {
  constructor(readonly report: Report) {}
}

/**
 * Runs the work in one transaction. `work` says whether to keep what it wrote: the transaction
 * is undone when it does not, and its report is returned either way.
 */
async function inTransaction<Report>(
  db: Database,
  work: (tx: Transaction) => Promise<{ keep: boolean; report: Report }>,
) {
  try {
    return await db.transaction(async (tx) => {
      // One change of the catalogue at a time. Two together would each count without the
      // other's rows.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('breaks'))`);
      const { keep, report } = await work(tx);
      if (!keep) throw new Undone(report);
      return report;
    });
  } catch (error) {
    if (error instanceof Undone) return error.report as Report;
    throw error;
  }
}

/** How many breaks the catalogue holds, whatever their list. */
export const countBreaks = Effect.fn("countBreaks")(function* (db: Database) {
  const [found] = yield* Effect.tryPromise({
    try: () => db.select({ total: count() }).from(surfBreak),
    catch: failed,
  });
  return found?.total ?? 0;
});

/**
 * Adds a list's breaks to the catalogue, all of them or none. A break the catalogue already
 * holds from the same list, under the same reference, is left as it is: a break belongs to the
 * instance once it is in, and no list changes it afterwards.
 *
 * Without `write`, the same work is done and undone, and the counts say what it would do. With
 * `intoEmpty`, nothing is added to a catalogue that holds a break already, whatever its list:
 * `inCatalogue` then says how many it holds.
 */
export const addBreaks = Effect.fn("addBreaks")(function* (
  db: Database,
  list: BreakList,
  options: { write: boolean; intoEmpty?: boolean },
) {
  const listed = list.breaks.map((found) => ({ id: crypto.randomUUID(), found }));
  const rows = listed.map(({ id, found }) => ({
    id,
    name: found.name,
    latitude: found.latitude,
    longitude: found.longitude,
    ...found.characteristics,
    location: found.location,
    timezone: found.timezone,
    provider: list.provider,
    providerRef: found.ref,
    sourceUrl: found.url,
    licenseType: list.license?.type,
    licenseUrl: list.license?.url,
    attribution: list.attribution,
  }));

  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const [before] = await tx.select({ total: count() }).from(surfBreak);
        const inCatalogue = before?.total ?? 0;
        const counts = { provider: list.provider, listed: rows.length, inCatalogue };
        if (options.intoEmpty && inCatalogue > 0) {
          return { keep: false, report: { ...counts, added: 0, known: 0, isRefused: true } };
        }

        const added = new Set<string>();
        for (let start = 0; start < rows.length; start += BREAKS_PER_STATEMENT) {
          const stored = await tx
            .insert(surfBreak)
            .values(rows.slice(start, start + BREAKS_PER_STATEMENT))
            .onConflictDoNothing({ target: [surfBreak.provider, surfBreak.providerRef] })
            .returning({ id: surfBreak.id });
          for (const { id } of stored) added.add(id);
        }

        const records = listed.flatMap(({ id, found }) =>
          added.has(id) && found.details && Object.keys(found.details).length > 0
            ? [{ breakId: id, details: found.details }]
            : [],
        );
        for (let start = 0; start < records.length; start += RECORDS_PER_STATEMENT) {
          await tx
            .insert(surfBreakRecord)
            .values(records.slice(start, start + RECORDS_PER_STATEMENT));
        }

        const report = {
          ...counts,
          added: added.size,
          // The breaks the catalogue already held from this list. They were left as they are.
          known: rows.length - added.size,
          isRefused: false,
        };
        return { keep: options.write && added.size > 0, report };
      }),
    catch: failed,
  });
});

/**
 * Deletes the breaks the catalogue holds from one list, as they are now. The spots made from
 * them keep their own name and point, and lose only the link. Without `write`, the same work is
 * done and undone.
 */
export const removeBreaks = Effect.fn("removeBreaks")(function* (
  db: Database,
  provider: string,
  options: { write: boolean },
) {
  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const ofList = tx
          .select({ id: surfBreak.id })
          .from(surfBreak)
          .where(eq(surfBreak.provider, provider));
        const [linked] = await tx
          .select({ total: count() })
          .from(spot)
          .where(inArray(spot.breakId, ofList));
        const removed = await tx
          .delete(surfBreak)
          .where(eq(surfBreak.provider, provider))
          .returning({ id: surfBreak.id });

        const report = { removed: removed.length, spots: linked?.total ?? 0 };
        return { keep: options.write && removed.length > 0, report };
      }),
    catch: failed,
  });
});
