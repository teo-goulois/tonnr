import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { breakContribution } from "@repo/db/schema/community";
import { PUBLICATION_STATES, spot, spotPublication, surfBreak } from "@repo/db/schema/spots";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import { inBbox } from "../bbox";
import { characteristicsSchema, describeCharacteristics } from "../characteristics";
import { adminProcedure } from "../index";
import { boxAround, metersBetween } from "../points";
import { settleRanks, sponsorOf } from "../standings";
import { hasControlCharacter } from "../text";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

// A break of the catalogue this close to the spot may be the same place.
const SAME_BREAK_METERS = 500;
// A spot of another account this close is the same place, kept private by someone else.
const SAME_SPOT_METERS = 150;
// What a break made of a spot says of where it comes from.
const COMMUNITY = {
  provider: "community",
  licenseType: "ODbL-1.0",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  attribution: "Contributed by a user of this instance",
};

const publicationSchema = z.object({
  id: z.string(),
  status: z.enum(PUBLICATION_STATES),
  // What the owner told the operator.
  note: z.string().nullable(),
  // Why it was refused.
  reason: z.string().nullable(),
  requestedAt: z.date(),
  decidedAt: z.date().nullable(),
  // The account that asked, by its identifier.
  accountId: z.string(),
  // The spot as it is now. `updatedAt` is given back when it is accepted, so that what is
  // published is what was read.
  spot: z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    characteristics: characteristicsSchema,
    updatedAt: z.date(),
  }),
  // The break of the catalogue the spot became, once accepted.
  breakId: z.string().nullable(),
  // The breaks of the catalogue near the spot, the nearest first: it may be one of them.
  nearbyBreaks: z.array(z.object({ id: z.string(), name: z.string(), meters: z.number() })),
  // How many other accounts keep a spot of their own at the same place. They are not named: a
  // place that others keep to themselves may be one that is not known to all.
  otherAccountsHere: z.number(),
});

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function noRequest(id: string) {
  return new ORPCError("NOT_FOUND", { message: `No request "${id}".` });
}

async function describe(
  db: Database | Transaction,
  row: { request: typeof spotPublication.$inferSelect; spot: typeof spot.$inferSelect },
) {
  const here = row.spot;
  const breaks = await db
    .select({
      id: surfBreak.id,
      name: surfBreak.name,
      latitude: surfBreak.latitude,
      longitude: surfBreak.longitude,
    })
    .from(surfBreak)
    .where(inBbox(surfBreak.latitude, surfBreak.longitude, boxAround(here, SAME_BREAK_METERS)));
  const others = await db
    .select({ userId: spot.userId, latitude: spot.latitude, longitude: spot.longitude })
    .from(spot)
    .where(
      and(
        ne(spot.userId, here.userId),
        inBbox(spot.latitude, spot.longitude, boxAround(here, SAME_SPOT_METERS)),
      ),
    );

  return {
    id: row.request.id,
    status: row.request.status,
    note: row.request.note,
    reason: row.request.reason,
    requestedAt: row.request.createdAt,
    decidedAt: row.request.decidedAt,
    accountId: row.request.userId,
    spot: {
      id: here.id,
      name: here.name,
      latitude: here.latitude,
      longitude: here.longitude,
      characteristics: describeCharacteristics(here.characteristics),
      updatedAt: here.updatedAt,
    },
    breakId: row.request.breakId,
    nearbyBreaks: breaks
      .map((found) => ({
        id: found.id,
        name: found.name,
        meters: Math.round(metersBetween(here, found)),
      }))
      // The break the spot became is not a neighbour of it.
      .filter((found) => found.meters <= SAME_BREAK_METERS && found.id !== row.request.breakId)
      .sort((a, b) => a.meters - b.meters),
    otherAccountsHere: new Set(
      others
        .filter((other) => metersBetween(here, other) <= SAME_SPOT_METERS)
        .map((other) => other.userId),
    ).size,
  };
}

/**
 * Holds a request that waits, and before it its spot: deleting a spot holds the spot, then takes
 * its requests with it, so whatever answers a request holds them in that order too.
 */
async function holdPending(tx: Transaction, id: string) {
  const [asked] = await tx
    .select({ spotId: spotPublication.spotId })
    .from(spotPublication)
    .where(eq(spotPublication.id, id));
  if (!asked) throw noRequest(id);
  const [here] = await tx.select().from(spot).where(eq(spot.id, asked.spotId)).for("update");
  const [request] = await tx
    .select()
    .from(spotPublication)
    .where(eq(spotPublication.id, id))
    .for("update");
  // The spot was deleted meanwhile, and its request with it.
  if (!here || !request) throw noRequest(id);
  if (request.status !== "pending") {
    throw new ORPCError("CONFLICT", { message: "This request was already answered." });
  }
  return { request, spot: here };
}

export const publicationsRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/publications",
      summary: "The spots their owners asked to make public",
      description:
        `${ADMIN_ONLY} The requests that wait come the oldest first, the answered ones the ` +
        "latest first. Each comes with the spot as it is now, the breaks of the catalogue " +
        `within ${SAME_BREAK_METERS} meters of it, and how many other accounts keep a spot of ` +
        `their own within ${SAME_SPOT_METERS} meters. Decision 034.`,
      tags: ["Publications"],
    })
    .input(z.object({ status: z.enum(PUBLICATION_STATES).default("pending") }))
    .output(z.object({ publications: z.array(publicationSchema) }))
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select({ request: spotPublication, spot })
        .from(spotPublication)
        .innerJoin(spot, eq(spot.id, spotPublication.spotId))
        .where(eq(spotPublication.status, input.status))
        .orderBy(
          input.status === "pending"
            ? asc(spotPublication.createdAt)
            : desc(spotPublication.decidedAt),
          asc(spotPublication.id),
        )
        .limit(200);
      const publications = [];
      for (const row of rows) publications.push(await describe(context.db, row));
      return { publications };
    }),

  accept: adminProcedure
    .route({
      method: "POST",
      path: "/publications/{id}/accept",
      summary: "Make a break of the catalogue of a spot",
      description:
        `${ADMIN_ONLY} The break takes the spot's name, its point and what its owner says it ` +
        "is like, under the Open Database License, and names no account. The spot stays its " +
        "owner's, and what they change in it afterwards does not change the break. " +
        "`spotUpdatedAt` is the spot's as it was read: a spot that changed since is not " +
        "published, and the answer is 409. Decision 034.",
      tags: ["Publications"],
    })
    .input(z.object({ id: z.string(), spotUpdatedAt: z.coerce.date() }))
    .output(publicationSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        // The owner's row, and its sponsor's, before anything else: accepting raises their
        // scores, and what raises a score holds its account first.
        const [asked] = await tx
          .select({ userId: spotPublication.userId })
          .from(spotPublication)
          .where(eq(spotPublication.id, input.id));
        if (!asked) throw noRequest(input.id);
        await holdAccounts(tx, [asked.userId, await sponsorOf(tx, asked.userId)]);
        const held = await holdPending(tx, input.id);
        if (held.spot.updatedAt.getTime() !== input.spotUpdatedAt.getTime()) {
          throw new ORPCError("CONFLICT", {
            message: "The spot changed since it was read. Read it again.",
          });
        }

        const said = held.spot.characteristics ?? {};
        const breakId = crypto.randomUUID();
        await tx.insert(surfBreak).values({
          id: breakId,
          name: held.spot.name,
          latitude: held.spot.latitude,
          longitude: held.spot.longitude,
          breakTypes: said.breakTypes ?? null,
          waveDirections: said.waveDirections ?? null,
          bottomTypes: said.bottomTypes ?? null,
          abilityLevels: said.abilityLevels ?? null,
          boardTypes: said.boardTypes ?? null,
          bestSeasons: said.bestSeasons ?? null,
          bestTides: said.bestTides ?? null,
          bestSwellDirections: said.bestSwellDirections ?? null,
          bestWindDirections: said.bestWindDirections ?? null,
          offshoreDirectionDegrees: said.offshoreDirectionDegrees ?? null,
          waveSizeMeters: said.waveSizeMeters ?? null,
          ...COMMUNITY,
          // A break is known again by its provider and this: its own id, which names no one.
          providerRef: breakId,
        });
        // The spot stands on the break it became. Its day of change stays: nothing its owner
        // wrote changed.
        const [linked] = await tx
          .update(spot)
          .set({ breakId, updatedAt: held.spot.updatedAt })
          .where(eq(spot.id, held.spot.id))
          .returning();
        const [request] = await tx
          .update(spotPublication)
          .set({ status: "accepted", decidedBy: operatorId, decidedAt: new Date(), breakId })
          .where(eq(spotPublication.id, input.id))
          .returning();
        if (!linked || !request) throw noRequest(input.id);

        // The break is a contribution of whoever asked: it counts for them, and stays theirs
        // to be counted when they delete the spot. The break itself names no account, and
        // neither does anything that is answered of this row to another. Decision 041.
        const now = new Date();
        await tx.insert(breakContribution).values({
          id: crypto.randomUUID(),
          breakId,
          breakRef: breakId,
          userId: request.userId,
          line: "place",
          value: held.spot.name,
          license: "ODbL-1.0",
          status: "confirmed",
          decidedBy: operatorId,
          decidedAt: now,
          confirmedAt: now,
        });
        await settleRanks(tx, [request.userId]);

        await recordAction(tx, {
          operatorId,
          action: "spot.publish",
          developer: null,
          account: { id: request.userId },
          changes: { breakId },
        });
        return describe(tx, { request, spot: linked });
      });
    }),

  refuse: adminProcedure
    .route({
      method: "POST",
      path: "/publications/{id}/refuse",
      summary: "Refuse to make a spot public, and say why",
      description:
        `${ADMIN_ONLY} The spot stays its owner's alone, and its owner reads the reason. They ` +
        "may ask again. Decision 034.",
      tags: ["Publications"],
    })
    .input(
      z.object({
        id: z.string(),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(280)
          .refine((reason) => !hasControlCharacter(reason), "must not contain control characters"),
      }),
    )
    .output(publicationSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const held = await holdPending(tx, input.id);
        const [request] = await tx
          .update(spotPublication)
          .set({
            status: "refused",
            reason: input.reason,
            decidedBy: operatorId,
            decidedAt: new Date(),
          })
          .where(eq(spotPublication.id, input.id))
          .returning();
        if (!request) throw noRequest(input.id);

        await recordAction(tx, {
          operatorId,
          action: "spot.refuse",
          developer: null,
          account: { id: request.userId },
        });
        return describe(tx, { request, spot: held.spot });
      });
    }),
};
