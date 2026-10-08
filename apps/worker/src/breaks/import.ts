import type { Database } from "@repo/db";
import { surfBreak } from "@repo/db/schema/spots";
import { and, count, eq, max, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "../store";
import { osm } from "./osm";
import type { BreakList, BreakSource } from "./source";

export const breakSources: readonly BreakSource[] = [osm];

const DAY_MS = 24 * 60 * 60 * 1000;
// A source is asked again at startup when its last import is older than this.
const STALE_MS = 8 * DAY_MS;
// A list this much shorter than what the catalogue holds of the source is taken for a source
// that answered in part, and nothing is deleted. Below a few breaks the rule would tell nothing.
const MIN_SHARE_OF_KNOWN = 0.5;
const MIN_KNOWN_TO_DOUBT = 20;
// A break takes eleven parameters, and Postgres accepts 65,535 in a statement.
const BREAKS_PER_STATEMENT = 2000;

const failed = (source: BreakSource) => (cause: unknown) =>
  new StoreError({ provider: `breaks-${source.id}`, cause });

/**
 * Makes the catalogue hold what the source lists. A break already known keeps its id and takes
 * the source's name and position. A break the source no longer lists is deleted, and the spots
 * made from it keep their own name and point.
 *
 * `fetchedAt` is when the list was asked for. Null is returned, and nothing written, when a
 * list asked for later is already stored.
 */
export const saveBreaks = Effect.fn("saveBreaks")(function* (
  db: Database,
  source: BreakSource,
  list: BreakList,
  fetchedAt: Date,
) {
  // One row per reference: the database refuses to write a row twice in a statement.
  const byRef = new Map(list.breaks.map((found) => [found.ref, found]));
  const rows = Array.from(byRef.values(), (found) => ({
    id: crypto.randomUUID(),
    provider: source.id,
    providerRef: found.ref,
    name: found.name,
    latitude: found.latitude,
    longitude: found.longitude,
    sourceUrl: found.url,
    licenseType: source.licenseType,
    licenseUrl: source.licenseUrl,
    attribution: source.attribution,
    lastSeenAt: fetchedAt,
  }));
  // What the source still lists: the breaks read, and the ones that could not be.
  const listedRefs = [...byRef.keys(), ...list.unreadable];
  const ofSource = eq(surfBreak.provider, source.id);

  return yield* Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        // One import of a source at a time. Two together would each miss the rows the other
        // is writing, and could wait on each other for ever.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`breaks-${source.id}`}))`);

        const [before] = await tx
          .select({ total: count(), latest: max(surfBreak.lastSeenAt) })
          .from(surfBreak)
          .where(ofSource);
        const known = before?.total ?? 0;
        if (before?.latest && before.latest > fetchedAt) return null;

        for (let start = 0; start < rows.length; start += BREAKS_PER_STATEMENT) {
          await tx
            .insert(surfBreak)
            .values(rows.slice(start, start + BREAKS_PER_STATEMENT))
            .onConflictDoUpdate({
              target: [surfBreak.provider, surfBreak.providerRef],
              set: {
                name: sql`excluded.name`,
                latitude: sql`excluded.latitude`,
                longitude: sql`excluded.longitude`,
                sourceUrl: sql`excluded.source_url`,
                licenseType: sql`excluded.license_type`,
                licenseUrl: sql`excluded.license_url`,
                attribution: sql`excluded.attribution`,
                lastSeenAt: sql`excluded.last_seen_at`,
              },
            });
        }

        const isDoubtful =
          rows.length === 0 ||
          (known >= MIN_KNOWN_TO_DOUBT && rows.length < known * MIN_SHARE_OF_KNOWN);
        const removed = isDoubtful
          ? []
          : await tx
              .delete(surfBreak)
              // One parameter for the whole list, however long it is.
              .where(
                and(
                  ofSource,
                  sql`${surfBreak.providerRef} <> all(${sql.param(listedRefs)}::text[])`,
                ),
              )
              .returning({ id: surfBreak.id });

        const [after] = await tx.select({ total: count() }).from(surfBreak).where(ofSource);
        const total = after?.total ?? 0;
        return {
          listed: rows.length,
          added: total - known + removed.length,
          removed: removed.length,
          // Breaks the list did not give and that stayed: unreadable, or kept out of doubt.
          kept: total - rows.length,
          isDoubtful,
        };
      }),
    catch: failed(source),
  });
});

/** Fetches a source's list of breaks and stores it. */
export const importBreaks = Effect.fn("importBreaks")(function* (
  source: BreakSource,
  db: Database,
  now: Date = new Date(),
) {
  const list = yield* source.fetchBreaks;
  const saved = yield* saveBreaks(db, source, list, now);
  if (!saved) {
    yield* Effect.logWarning(
      `breaks-${source.id}: a list asked for later is already stored, so this one was left out`,
    );
    return null;
  }

  yield* Effect.logInfo(
    `breaks-${source.id}: ${saved.listed} listed, ${saved.added} added, ${saved.removed} removed, ${list.unreadable.length} unreadable`,
  );
  if (saved.isDoubtful && saved.kept > 0) {
    yield* Effect.logWarning(
      `breaks-${source.id}: the list is empty or less than half of what the catalogue holds, so the ${saved.kept} breaks missing from it were kept. Delete them by hand if the source did lose them.`,
    );
  }
  return saved;
});

/** Whether a source has never been imported, or not for more than a week. */
export const isDue = Effect.fn("isDue")(function* (
  source: BreakSource,
  db: Database,
  now: Date = new Date(),
) {
  const [row] = yield* Effect.tryPromise({
    try: () =>
      db
        .select({ latest: max(surfBreak.lastSeenAt) })
        .from(surfBreak)
        .where(eq(surfBreak.provider, source.id)),
    catch: failed(source),
  });
  return !row?.latest || now.getTime() - row.latest.getTime() > STALE_MS;
});
