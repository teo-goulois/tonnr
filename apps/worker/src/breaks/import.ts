import type { Database } from "@repo/db";
import { addressOf } from "@repo/db/addresses";
import { holdCatalogue, knownRefs, reopenCandidatesOf } from "@repo/db/catalogue";
import { spot, surfBreak, surfBreakListing } from "@repo/db/schema/spots";
import { count, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "../store";
import { osm } from "./osm";
import type { BreakList, BreakSource } from "./source";

export const breakSources: readonly BreakSource[] = [osm];

// A break takes some twenty parameters, and Postgres accepts 65,535 in a statement.
const BREAKS_PER_STATEMENT = 1000;
// What a list says besides can weigh several kilobytes a break.
const LISTINGS_PER_STATEMENT = 500;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const failed = (cause: unknown) => new StoreError({ provider: "breaks", cause });

// What the work throws once it has counted, so that the database undoes what it wrote.
class Undone<Report> {
  constructor(readonly report: Report) {}
}

/**
 * Runs the work in one transaction, the catalogue held. `work` says whether to keep what it
 * wrote: the transaction is undone when it does not, and its report is returned either way.
 */
export async function inTransaction<Report>(
  db: Database,
  work: (tx: Transaction) => Promise<{ keep: boolean; report: Report }>,
) {
  try {
    return await db.transaction(async (tx) => {
      // One change of the catalogue at a time. Two together would each count without the
      // other's rows, and an operator's merge would move rows under the count.
      await holdCatalogue(tx);
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
 * instance once it is in, and no list changes it afterwards. One that an operator merged into
 * another, or deleted, is known too, and does not come back (decision 049).
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

        const known = await knownRefs(
          tx,
          list.provider,
          rows.map((row) => row.providerRef),
        );
        const added = new Set<string>();
        // Each new break takes the address of its page, from its places and its name, for
        // good: decision 057. The ones given in this run are reserved against one another.
        const reserved = new Set<string>();
        const fresh = [];
        for (const row of rows) {
          if (known.has(row.providerRef)) continue;
          fresh.push({ ...row, ...(await addressOf(tx, row, reserved)) });
        }
        for (let start = 0; start < fresh.length; start += BREAKS_PER_STATEMENT) {
          const stored = await tx
            .insert(surfBreak)
            .values(fresh.slice(start, start + BREAKS_PER_STATEMENT))
            // A file that names a reference twice adds its first line.
            .onConflictDoNothing({ target: [surfBreak.provider, surfBreak.providerRef] })
            .returning({ id: surfBreak.id });
          for (const { id } of stored) added.add(id);
        }

        // Each break added is named by its list, with what the list says of it besides.
        const listings = listed.flatMap(({ id, found }) =>
          added.has(id)
            ? [
                {
                  list: list.provider,
                  ref: found.ref,
                  breakId: id,
                  details:
                    found.details && Object.keys(found.details).length > 0 ? found.details : null,
                },
              ]
            : [],
        );
        for (let start = 0; start < listings.length; start += LISTINGS_PER_STATEMENT) {
          await tx
            .insert(surfBreakListing)
            .values(listings.slice(start, start + LISTINGS_PER_STATEMENT));
        }

        const report = {
          ...counts,
          added: added.size,
          // The breaks the catalogue already held from this list, or that an operator merged or
          // deleted. They were left as they are.
          known: rows.length - added.size,
          isRefused: false,
        };
        return { keep: options.write && added.size > 0, report };
      }),
    catch: failed,
  });
});

/**
 * Deletes the breaks the catalogue holds from one list, as they are now, and forgets what the
 * list said of any break: added again, the list is added whole. A break of another list that one
 * of its breaks was merged into stays. The spots made from the deleted breaks keep their own
 * name and point, and lose only the link, and the candidates that went into them wait to be
 * decided again. Without `write`, the same work is done and undone.
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
        const going = await ofList;
        await reopenCandidatesOf(
          tx,
          going.map(({ id }) => id),
        );
        const forgotten = await tx
          .delete(surfBreakListing)
          .where(eq(surfBreakListing.list, provider))
          .returning({ ref: surfBreakListing.ref });
        const removed = await tx
          .delete(surfBreak)
          .where(eq(surfBreak.provider, provider))
          .returning({ id: surfBreak.id });

        const report = {
          removed: removed.length,
          spots: linked?.total ?? 0,
          // What the list said of breaks it no longer has: merged into another, or deleted.
          forgotten: Math.max(0, forgotten.length - removed.length),
        };
        return {
          keep: options.write && (removed.length > 0 || forgotten.length > 0),
          report,
        };
      }),
    catch: failed,
  });
});
