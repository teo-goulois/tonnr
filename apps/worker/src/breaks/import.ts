import type { Database } from "@repo/db";
import { surfBreak } from "@repo/db/schema/spots";
import { and, count, eq, lt, max, sql } from "drizzle-orm";
import { Effect } from "effect";

import { StoreError } from "../store";
import { osm } from "./osm";
import type { BreakSource, ListedBreak } from "./source";

export const breakSources: readonly BreakSource[] = [osm];

const DAY_MS = 24 * 60 * 60 * 1000;
// A source is asked again at startup when its last import is older than this.
const STALE_MS = 8 * DAY_MS;
// A list this much shorter than the last one is a source that answered in part, not a source
// that lost its breaks. Nothing is then deleted.
const MIN_SHARE_OF_KNOWN = 0.5;
// A break takes ten parameters, and Postgres accepts 65,535 in a statement.
const BREAKS_PER_STATEMENT = 2000;

const failed = (source: BreakSource) => (cause: unknown) =>
  new StoreError({ provider: `breaks-${source.id}`, cause });

/**
 * Makes the catalogue hold what the source lists now. A break already known keeps its id and
 * takes the source's name and position. A break the source no longer lists is deleted, and the
 * spots made from it keep their own name and point.
 */
export const saveBreaks = Effect.fn("saveBreaks")(function* (
  db: Database,
  source: BreakSource,
  listed: readonly ListedBreak[],
  now: Date,
) {
  // One row per reference: the database refuses to write a row twice in a statement.
  const byRef = new Map(listed.map((found) => [found.ref, found]));
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
    lastSeenAt: now,
  }));
  const ofSource = eq(surfBreak.provider, source.id);

  return yield* Effect.tryPromise({
    try: () =>
      db.transaction(async (tx) => {
        const [before] = await tx.select({ total: count() }).from(surfBreak).where(ofSource);
        const known = before?.total ?? 0;

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

        const isPartial = rows.length < known * MIN_SHARE_OF_KNOWN;
        const removed = isPartial
          ? []
          : await tx
              .delete(surfBreak)
              .where(and(ofSource, lt(surfBreak.lastSeenAt, now)))
              .returning({ id: surfBreak.id });

        const [after] = await tx.select({ total: count() }).from(surfBreak).where(ofSource);
        const total = after?.total ?? 0;
        return {
          listed: rows.length,
          added: total - known + removed.length,
          removed: removed.length,
          // Breaks the source did not list and that were kept, because its list looked partial.
          keptMissing: total - rows.length,
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
  const saved = yield* saveBreaks(db, source, list.breaks, now);

  yield* Effect.logInfo(
    `breaks-${source.id}: ${saved.listed} listed, ${saved.added} added, ${saved.removed} removed, ${list.rejected} rejected`,
  );
  if (saved.keptMissing > 0) {
    yield* Effect.logWarning(
      `breaks-${source.id}: the list is less than half the last one, so the ${saved.keptMissing} breaks missing from it were kept`,
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
