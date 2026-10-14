import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "./index";
import { breakCandidate } from "./schema/catalogue";
import { surfBreak, surfBreakListing } from "./schema/spots";

// What changes the catalogue of breaks, for the worker's commands and for the admin, which both
// change it: decisions 024 and 049.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;

/**
 * Holds the catalogue until the transaction ends: one change of it at a time, whether a command
 * adds a list or an operator merges two breaks. It is taken first, before anything else, so that
 * two changes never wait on each other.
 */
export async function holdCatalogue(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('breaks'))`);
}

/** Of some references of a list, those the catalogue knows already, as a break or as one that was. */
export async function knownRefs(db: Reader, list: string, refs: string[]) {
  const known = new Set<string>();
  // A statement takes some 65,000 parameters at most.
  for (let start = 0; start < refs.length; start += 10_000) {
    const some = refs.slice(start, start + 10_000);
    const listed = await db
      .select({ ref: surfBreakListing.ref })
      .from(surfBreakListing)
      .where(and(eq(surfBreakListing.list, list), inArray(surfBreakListing.ref, some)));
    for (const { ref } of listed) known.add(ref);
    // A break the version before this one added has no listing.
    const held = await db
      .select({ ref: surfBreak.providerRef })
      .from(surfBreak)
      .where(and(eq(surfBreak.provider, list), inArray(surfBreak.providerRef, some)));
    for (const { ref } of held) if (ref !== null) known.add(ref);
  }
  return known;
}

/**
 * Puts back in the queue the candidates that became, or were merged into, breaks that are about
 * to be deleted: what the operator decided of them goes with the break, and they are decided
 * again. Their listing stays, with no break, until then.
 */
export async function reopenCandidatesOf(tx: Transaction, breakIds: string[]) {
  if (breakIds.length === 0) return;
  await tx
    .update(breakCandidate)
    .set({
      status: "waiting",
      breakId: null,
      decidedBy: null,
      decidedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(breakCandidate.breakId, breakIds),
        inArray(breakCandidate.status, ["added", "merged"]),
      ),
    );
}

/**
 * Names by its list every break that names its list and its reference and has no listing yet,
 * with what the list said of it besides, and gives a listing that holds nothing what the list
 * said. The version before this one adds breaks without listings, and may while this one is
 * deployed: the API runs this each time it starts, after the migrations, as the migration that
 * made the table did once. It writes nothing twice.
 */
export async function catchUpListings(db: Pick<Database, "execute">) {
  await db.execute(sql`
    insert into surf_break_listing (list, ref, break_id, details, created_at)
    select b.provider, b.provider_ref, b.id, r.details, b.created_at
    from surf_break b
    left join surf_break_record r on r.break_id = b.id
    where b.provider is not null and b.provider_ref is not null
    on conflict (list, ref) do update set details = excluded.details
    where surf_break_listing.details is null
      and excluded.details is not null
      and surf_break_listing.break_id = excluded.break_id
  `);
}
