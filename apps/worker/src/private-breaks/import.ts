import type { Database } from "@repo/db";
import { privateBreak, privateBreakImport } from "@repo/db/schema/private-breaks";
import { count, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "../store";
import type { PrivateBreakList } from "./file";

// A break takes eleven parameters, and its details can weigh several kilobytes.
const BREAKS_PER_STATEMENT = 500;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const failed = (cause: unknown) => new StoreError({ provider: "private-breaks", cause });

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
      // One import or removal at a time. Two together would each count without the other's rows.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('private-breaks'))`);
      const { keep, report } = await work(tx);
      if (!keep) throw new Undone(report);
      return report;
    });
  } catch (error) {
    if (error instanceof Undone) return error.report as Report;
    throw error;
  }
}

/**
 * Stores a list in the private list, all of it or nothing. A break already known keeps its id
 * and takes the file's values. A break the file does not list stays as it was: nothing is
 * deleted here.
 *
 * Without `write`, the same work is done and undone, and the counts say what it would do.
 * `importId` is null when nothing was stored: without `write`, and when the list changes nothing.
 */
export const importPrivateBreaks = Effect.fn("importPrivateBreaks")(function* (
  db: Database,
  list: PrivateBreakList,
  options: { fileSha256: string; write: boolean },
) {
  const importId = crypto.randomUUID();
  const rows = list.breaks.map((found) => ({
    id: crypto.randomUUID(),
    provider: list.provider,
    providerRef: found.ref,
    name: found.name,
    latitude: found.latitude,
    longitude: found.longitude,
    sourceUrl: found.url,
    termsUrl: list.termsUrl,
    details: found.details,
    collectedAt: found.collectedAt,
    importId,
  }));
  const ofProvider = eq(privateBreak.provider, list.provider);

  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const [before] = await tx.select({ total: count() }).from(privateBreak).where(ofProvider);
        const known = before?.total ?? 0;

        // The breaks point to their import, so it is written first and counted afterwards.
        await tx.insert(privateBreakImport).values({
          id: importId,
          provider: list.provider,
          fileSha256: options.fileSha256,
          listed: rows.length,
          added: 0,
          changed: 0,
          unchanged: 0,
          absent: 0,
        });

        let written = 0;
        for (let start = 0; start < rows.length; start += BREAKS_PER_STATEMENT) {
          const stored = await tx
            .insert(privateBreak)
            .values(rows.slice(start, start + BREAKS_PER_STATEMENT))
            .onConflictDoUpdate({
              target: [privateBreak.provider, privateBreak.providerRef],
              set: {
                name: sql`excluded.name`,
                latitude: sql`excluded.latitude`,
                longitude: sql`excluded.longitude`,
                sourceUrl: sql`excluded.source_url`,
                termsUrl: sql`excluded.terms_url`,
                details: sql`excluded.details`,
                collectedAt: sql`excluded.collected_at`,
                importedAt: sql`excluded.imported_at`,
              },
              // A break that already says the same is left alone, so that importing a file
              // twice writes nothing the second time.
              setWhere: sql`(${privateBreak.name}, ${privateBreak.latitude}, ${privateBreak.longitude}, ${privateBreak.sourceUrl}, ${privateBreak.termsUrl}, ${privateBreak.details}, ${privateBreak.collectedAt}) is distinct from (excluded.name, excluded.latitude, excluded.longitude, excluded.source_url, excluded.terms_url, excluded.details, excluded.collected_at)`,
            })
            .returning({ id: privateBreak.id });
          written += stored.length;
        }

        const [after] = await tx.select({ total: count() }).from(privateBreak).where(ofProvider);
        const total = after?.total ?? 0;
        const added = total - known;
        const counts = {
          listed: rows.length,
          added,
          changed: written - added,
          unchanged: rows.length - written,
          // The provider's breaks that the file does not list. They stay.
          absent: total - rows.length,
        };
        await tx.update(privateBreakImport).set(counts).where(eq(privateBreakImport.id, importId));

        // An import that wrote no break is not kept either: the record would say nothing.
        const keep = options.write && written > 0;
        const report = { importId: keep ? importId : null, provider: list.provider, ...counts };
        return { keep, report };
      }),
    catch: failed,
  });
});

/**
 * Deletes the breaks an import added, and the import. It deletes them as they are now, with
 * whatever a later import changed in them. A break that the import only changed stays, with the
 * values it gave: importing the earlier file again brings the earlier values back.
 * Null is returned when no import has this id.
 */
export const removePrivateImport = Effect.fn("removePrivateImport")(function* (
  db: Database,
  importId: string,
  options: { write: boolean },
) {
  return yield* Effect.tryPromise({
    try: () =>
      inTransaction(db, async (tx) => {
        const [found] = await tx
          .select()
          .from(privateBreakImport)
          .where(eq(privateBreakImport.id, importId));
        if (!found) return { keep: false, report: null };

        const removed = await tx
          .delete(privateBreak)
          .where(eq(privateBreak.importId, importId))
          .returning({ id: privateBreak.id });
        await tx.delete(privateBreakImport).where(eq(privateBreakImport.id, importId));

        const { provider, importedAt } = found;
        return { keep: options.write, report: { provider, importedAt, removed: removed.length } };
      }),
    catch: failed,
  });
});
