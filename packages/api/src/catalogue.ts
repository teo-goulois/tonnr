import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { addressOf, keepAddressOf } from "@repo/db/addresses";
import { reopenCandidatesOf } from "@repo/db/catalogue";
import { breakCandidate } from "@repo/db/schema/catalogue";
import { breakAnswer, breakContribution } from "@repo/db/schema/community";
import { stationList, stationListBreak } from "@repo/db/schema/lists";
import { recentView } from "@repo/db/schema/preferences";
import { surfSession } from "@repo/db/schema/sessions";
import {
  BREAK_DESCRIPTION_LANGUAGES,
  BREAK_DESCRIPTION_MOST,
  spot,
  spotPublication,
  surfBreak,
  surfBreakListing,
} from "@repo/db/schema/spots";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { inBbox } from "./bbox";
import {
  characteristicsInput,
  characteristicsSchema,
  describeCharacteristics,
  keptCharacteristics,
} from "./characteristics";
import { confirmedWordsOf } from "./guides";
import { boxAround, metersBetween, type Point } from "./points";
import { hasControlCharacter } from "./text";

// What an operator does to the catalogue of breaks from the admin, for the procedures that look
// at a break, change it, merge two, or decide what a list proposes: decision 049.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select" | "selectDistinctOn">;
type Break = typeof surfBreak.$inferSelect;

export const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

/** A description of a break, as an operator writes it: a few sentences, on one line. */
export const descriptionInput = z
  .object({
    text: z
      .string()
      .transform((text) => text.replace(/\s+/g, " ").trim())
      .pipe(z.string().min(3).max(BREAK_DESCRIPTION_MOST))
      .refine((text) => !hasControlCharacter(text), "must not contain control characters"),
    language: z.enum(BREAK_DESCRIPTION_LANGUAGES),
  })
  .nullable();

/** What an operator gives a break: its name, its point, what it is like, and its description. */
export const breakValuesInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((name) => !hasControlCharacter(name), "must not contain control characters"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  characteristics: characteristicsInput,
  description: descriptionInput,
});

export type BreakValues = z.infer<typeof breakValuesInput>;

/** The columns of a break that hold what an operator gave it. */
export function columnsOf(values: BreakValues) {
  const said = describeCharacteristics(keptCharacteristics(values.characteristics));
  return {
    name: values.name,
    latitude: values.latitude,
    longitude: values.longitude,
    ...said,
    description: values.description?.text ?? null,
    descriptionLanguage: values.description?.language ?? null,
  };
}

/** The names of the fields of a break that the columns would change. */
export function changedFields(row: Break, columns: ReturnType<typeof columnsOf>) {
  return Object.entries(columns)
    .filter(([field, value]) => {
      const before = row[field as keyof Break];
      return JSON.stringify(before ?? null) !== JSON.stringify(value ?? null);
    })
    .map(([field]) => field);
}

/** What a break says of itself, as an operator reads it. */
export const operatorBreakSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  // What the catalogue holds, which an operator changes.
  characteristics: characteristicsSchema,
  // The lines of words that an account wrote and that were confirmed: the guide and the API
  // show these in place of the catalogue's (decision 041).
  confirmed: characteristicsSchema.partial(),
  description: z
    .object({ text: z.string(), language: z.enum(BREAK_DESCRIPTION_LANGUAGES) })
    .nullable(),
  location: z.array(z.string()).nullable(),
  timezone: z.string().nullable(),
  source: z.object({
    provider: z.string().nullable(),
    ref: z.string().nullable(),
    url: z.string().nullable(),
    attribution: z.string().nullable(),
    license: z.object({ type: z.string(), url: z.string() }).nullable(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export function describeForOperator(
  row: Break,
  confirmed: Partial<z.infer<typeof characteristicsSchema>> = {},
): z.infer<typeof operatorBreakSchema> {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    characteristics: {
      breakTypes: row.breakTypes,
      waveDirections: row.waveDirections,
      bottomTypes: row.bottomTypes,
      abilityLevels: row.abilityLevels,
      boardTypes: row.boardTypes,
      bestSeasons: row.bestSeasons,
      bestTides: row.bestTides,
      bestSwellDirections: row.bestSwellDirections,
      bestWindDirections: row.bestWindDirections,
      offshoreDirectionDegrees: row.offshoreDirectionDegrees,
      waveSizeMeters: row.waveSizeMeters,
    },
    confirmed,
    description:
      row.description && row.descriptionLanguage
        ? { text: row.description, language: row.descriptionLanguage }
        : null,
    location: row.location,
    timezone: row.timezone,
    source: {
      provider: row.provider,
      ref: row.providerRef,
      url: row.sourceUrl,
      attribution: row.attribution,
      license:
        row.licenseType && row.licenseUrl ? { type: row.licenseType, url: row.licenseUrl } : null,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Some breaks as an operator reads them, with what was confirmed of each. */
export async function describeAllForOperator(db: Reader, rows: Break[]) {
  const confirmed = await confirmedWordsOf(
    db,
    rows.map((row) => row.id),
  );
  // The words of a contribution are the catalogue's: they were checked when it was written, and
  // the answer is checked again as it leaves.
  return rows.map((row) =>
    describeForOperator(
      row,
      confirmed.get(row.id) as Partial<z.infer<typeof characteristicsSchema>> | undefined,
    ),
  );
}

export function noBreak(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No break "${id}".` });
}

export function changedSince() {
  return new ORPCError("CONFLICT", {
    message: "The break changed since it was read. Read it again.",
  });
}

/**
 * Holds a break until the transaction ends, and checks that it is still the version that was
 * read: what an operator decides of a break is decided of what they saw.
 */
export async function holdBreak(tx: Transaction, id: string, updatedAt: Date) {
  const [row] = await tx.select().from(surfBreak).where(eq(surfBreak.id, id)).for("update");
  if (!row) throw noBreak(id);
  if (row.updatedAt.getTime() !== updatedAt.getTime()) throw changedSince();
  return row;
}

/** Holds, in the order of their ids, the accounts' lists that hold some breaks. */
export async function holdListsOf(tx: Transaction, breakIds: string[]) {
  await tx
    .select({ id: stationList.id })
    .from(stationList)
    .where(
      inArray(
        stationList.id,
        tx
          .select({ id: stationListBreak.listId })
          .from(stationListBreak)
          .where(inArray(stationListBreak.breakId, breakIds)),
      ),
    )
    .orderBy(asc(stationList.id))
    .for("update");
}

/** What uses a break: the accounts' spots, lists, sessions, guide and its requests. */
export const usesSchema = z.object({
  spots: z.number(),
  lists: z.number(),
  sessions: z.number(),
  contributions: z.number(),
  answers: z.number(),
  publications: z.number(),
});

export async function usesOf(db: Pick<Database, "select">, id: string) {
  const counted = async (query: Promise<{ total: number }[]>) => (await query)[0]?.total ?? 0;
  return {
    spots: await counted(db.select({ total: count() }).from(spot).where(eq(spot.breakId, id))),
    lists: await counted(
      db.select({ total: count() }).from(stationListBreak).where(eq(stationListBreak.breakId, id)),
    ),
    sessions: await counted(
      db.select({ total: count() }).from(surfSession).where(eq(surfSession.breakId, id)),
    ),
    contributions: await counted(
      db
        .select({ total: count() })
        .from(breakContribution)
        .where(eq(breakContribution.breakId, id)),
    ),
    answers: await counted(
      db.select({ total: count() }).from(breakAnswer).where(eq(breakAnswer.breakId, id)),
    ),
    publications: await counted(
      db.select({ total: count() }).from(spotPublication).where(eq(spotPublication.breakId, id)),
    ),
  };
}

const isUsed = (uses: z.infer<typeof usesSchema>) => Object.values(uses).some((total) => total > 0);

/** A break near a point, as a list of them gives it. */
export const nearbySchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  meters: z.number(),
  provider: z.string().nullable(),
});

/** The breaks within some meters of a point, the nearest first. */
export async function breaksNear(
  db: Pick<Database, "select">,
  point: Point,
  meters: number,
  leaveOut: string[] = [],
) {
  const rows = await db
    .select({
      id: surfBreak.id,
      name: surfBreak.name,
      latitude: surfBreak.latitude,
      longitude: surfBreak.longitude,
      provider: surfBreak.provider,
    })
    .from(surfBreak)
    .where(inBbox(surfBreak.latitude, surfBreak.longitude, boxAround(point, meters)));
  return rows
    .map((row) => ({ ...row, meters: Math.round(metersBetween(point, row)) }))
    .filter((row) => row.meters <= meters && !leaveOut.includes(row.id))
    .sort((a, b) => a.meters - b.meters);
}

/**
 * Says that the list's reference of a break leads to another break now, or to none once the
 * break is deleted: adding the list again then brings back neither. A break the version before
 * this one added has no listing of its own yet.
 */
async function listingOf(tx: Transaction, row: Break, breakId: string | null) {
  if (row.provider === null || row.providerRef === null) return;
  await tx
    .insert(surfBreakListing)
    .values({ list: row.provider, ref: row.providerRef, breakId })
    .onConflictDoUpdate({
      target: [surfBreakListing.list, surfBreakListing.ref],
      set: { breakId },
    });
}

/**
 * Merges one break into another: everything that names the one that goes names the one that
 * stays, which takes the values the operator chose, and the one that goes is deleted. A break
 * that accounts wrote in the guide of, or that an operator made of a spot, does not go: the
 * points its authors were counted name it (decision 041). Merge the other into it.
 */
export async function mergeBreaks(
  tx: Transaction,
  options: {
    keep: Break;
    merge: Break;
    values: BreakValues;
    // Whose source the break keeps, which says where it was read and under what licence.
    sourceOf: "kept" | "merged";
  },
) {
  const { keep, merge } = options;
  const [written] = await tx
    .select({ total: count() })
    .from(breakContribution)
    .where(eq(breakContribution.breakId, merge.id));
  const [published] = await tx
    .select({ total: count() })
    .from(spotPublication)
    .where(eq(spotPublication.breakId, merge.id));
  if ((written?.total ?? 0) > 0 || (published?.total ?? 0) > 0) {
    throw new ORPCError("CONFLICT", {
      message:
        "Accounts wrote in this break's guide, or it was made of a spot: it cannot go. Merge the other break into it.",
    });
  }

  // What its owners changed in a spot or a session is not what this changes: their times stay.
  await tx
    .update(spot)
    .set({ breakId: keep.id, updatedAt: sql`${spot.updatedAt}` })
    .where(eq(spot.breakId, merge.id));
  await tx
    .update(surfSession)
    .set({ breakId: keep.id, updatedAt: sql`${surfSession.updatedAt}` })
    .where(eq(surfSession.breakId, merge.id));
  // A list that held both holds one.
  await tx.execute(sql`
    delete from ${stationListBreak} gone
    where gone.break_id = ${merge.id}
      and exists (
        select 1 from ${stationListBreak} kept
        where kept.list_id = gone.list_id and kept.break_id = ${keep.id}
      )
  `);
  await tx
    .update(stationListBreak)
    .set({ breakId: keep.id })
    .where(eq(stationListBreak.breakId, merge.id));
  // An account that answered a question of both keeps the answer it gave the one that stays.
  await tx.execute(sql`
    delete from ${breakAnswer} gone
    where gone.break_id = ${merge.id}
      and exists (
        select 1 from ${breakAnswer} kept
        where kept.break_id = ${keep.id} and kept.user_id = gone.user_id
          and kept.question = gone.question
      )
  `);
  await tx.update(breakAnswer).set({ breakId: keep.id }).where(eq(breakAnswer.breakId, merge.id));
  await tx.execute(sql`
    delete from ${recentView} gone
    where gone.kind = 'break' and gone.target_id = ${merge.id}
      and exists (
        select 1 from ${recentView} kept
        where kept.kind = 'break' and kept.target_id = ${keep.id} and kept.user_id = gone.user_id
      )
  `);
  await tx
    .update(recentView)
    .set({ targetId: keep.id })
    .where(and(eq(recentView.kind, "break"), eq(recentView.targetId, merge.id)));
  await tx
    .update(surfBreakListing)
    .set({ breakId: keep.id })
    .where(eq(surfBreakListing.breakId, merge.id));
  await listingOf(tx, merge, keep.id);
  await tx
    .update(breakCandidate)
    .set({ breakId: keep.id })
    .where(eq(breakCandidate.breakId, merge.id));
  // The address of the merged break's page leads to the one that stays: decision 057.
  await keepAddressOf(tx, merge, keep.id);

  await tx.delete(surfBreak).where(eq(surfBreak.id, merge.id));

  const columns = columnsOf(options.values);
  const source =
    options.sourceOf === "merged"
      ? {
          provider: merge.provider,
          providerRef: merge.providerRef,
          sourceUrl: merge.sourceUrl,
          licenseType: merge.licenseType,
          licenseUrl: merge.licenseUrl,
          attribution: merge.attribution,
        }
      : {};
  // A list that the one that goes came from says where it lies, when the one that stays does
  // not. A break that gains its places gains the address of its page with them, for good: the
  // merged break's address leads to it, and a page is answered there (decision 057).
  const location = keep.location ?? merge.location;
  const address =
    keep.countrySlug === null && location
      ? await addressOf(tx, { id: keep.id, name: columns.name ?? keep.name, location })
      : {};
  const [merged] = await tx
    .update(surfBreak)
    .set({
      ...columns,
      ...source,
      ...address,
      location,
      timezone: keep.timezone ?? merge.timezone,
      updatedAt: new Date(),
    })
    .where(eq(surfBreak.id, keep.id))
    .returning();
  if (!merged) throw noBreak(keep.id);
  return { merged, fields: changedFields(keep, columns) };
}

/**
 * Deletes a break that nothing of an account uses: one that is used is refused, with what uses
 * it, and an operator merges it into another instead. The candidates that went into it wait to
 * be decided again, and its list's reference stays known, so that adding the list again does not
 * bring it back.
 */
export async function deleteBreak(tx: Transaction, row: Break) {
  const uses = await usesOf(tx, row.id);
  if (isUsed(uses)) {
    throw new ORPCError("CONFLICT", {
      message: "Accounts use this break: merge it into another instead.",
      data: { uses },
    });
  }
  await reopenCandidatesOf(tx, [row.id]);
  await listingOf(tx, row, null);
  await tx
    .delete(recentView)
    .where(and(eq(recentView.kind, "break"), eq(recentView.targetId, row.id)));
  await tx.delete(surfBreak).where(eq(surfBreak.id, row.id));
}

/** The listings of some breaks: what each list said of them, by list and reference. */
export async function listingsOf(db: Pick<Database, "select">, breakIds: string[]) {
  if (breakIds.length === 0) return [];
  return db
    .select({
      list: surfBreakListing.list,
      ref: surfBreakListing.ref,
      breakId: surfBreakListing.breakId,
      details: surfBreakListing.details,
    })
    .from(surfBreakListing)
    .where(inArray(surfBreakListing.breakId, breakIds));
}
