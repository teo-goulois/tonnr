import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { apiKey, developer, developerCalls } from "@repo/db/schema/access";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import { hasControlCharacter } from "../text";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

const developerSchema = z.object({
  id: z.string(),
  name: z.string(),
  // How the operator reaches whoever holds the keys.
  contact: z.string().nullable(),
  note: z.string().nullable(),
  // How many calls the account's keys may make between them in an hour. Null: no limit.
  callsPerHour: z.number().nullable(),
  // While it is set, none of the account's keys works.
  suspendedAt: z.date().nullable(),
  createdAt: z.date(),
  // The account's keys that are not revoked.
  keys: z.number(),
  // The calls its keys were let through in the hour under way, UTC's. The limit counts these.
  callsThisHour: z.number(),
  // The minute one of its keys was last used. Null until then, and up to thirty seconds late.
  lastUsedAt: z.date().nullable(),
});

const named = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((name) => !hasControlCharacter(name), "must not contain control characters");
// Empty is how a form says "none".
const contact = z
  .string()
  .trim()
  .max(200)
  .refine((text) => !hasControlCharacter(text), "must not contain control characters")
  .transform((text) => (text === "" ? null : text))
  .nullable();
const note = z
  .string()
  .trim()
  .max(1000)
  // A note may run over several lines.
  .refine(
    (text) => !hasControlCharacter(text.replace(/[\n\r\t]/g, "")),
    "must not contain control characters",
  )
  .transform((text) => (text === "" ? null : text))
  .nullable();
const callsPerHour = z.number().int().min(1).max(1_000_000).nullable();

/** The developer accounts, or one of them, each with its keys counted and its calls this hour. */
async function described(db: Database, id?: string) {
  const keysOf = db
    .select({
      developerId: apiKey.developerId,
      keys: sql<number>`count(*) filter (where ${apiKey.revokedAt} is null)`
        .mapWith(Number)
        .as("keys"),
      lastUsedAt: max(apiKey.lastUsedAt).as("last_used_at"),
    })
    .from(apiKey)
    .groupBy(apiKey.developerId)
    .as("keys_of");

  return db
    .select({
      id: developer.id,
      name: developer.name,
      contact: developer.contact,
      note: developer.note,
      callsPerHour: developer.callsPerHour,
      suspendedAt: developer.suspendedAt,
      createdAt: developer.createdAt,
      keys: sql<number>`coalesce(${keysOf.keys}, 0)`.mapWith(Number),
      callsThisHour: sql<number>`coalesce(${developerCalls.calls}, 0)`.mapWith(Number),
      lastUsedAt: keysOf.lastUsedAt,
    })
    .from(developer)
    .leftJoin(keysOf, eq(keysOf.developerId, developer.id))
    .leftJoin(
      developerCalls,
      and(
        eq(developerCalls.developerId, developer.id),
        eq(developerCalls.hour, sql`date_trunc('hour', now(), 'UTC')`),
      ),
    )
    .where(id === undefined ? undefined : eq(developer.id, id))
    .orderBy(asc(developer.name), asc(developer.id));
}

const missing = (id: string) =>
  new ORPCError("NOT_FOUND", { message: `No developer account "${id}".` });

export const developersRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/developers",
      summary: "The developer accounts of the instance, by name",
      description: ADMIN_ONLY,
      tags: ["Developer accounts"],
    })
    .output(z.object({ developers: z.array(developerSchema) }))
    .handler(async ({ context }) => ({ developers: await described(context.db) })),

  create: adminProcedure
    .route({
      method: "POST",
      path: "/developers",
      summary: "Create a developer account",
      description:
        `${ADMIN_ONLY} A developer account is whoever consumes the API with keys. It is not an ` +
        "account that signs in: it has no password and no session.",
      tags: ["Developer accounts"],
      successStatus: 201,
    })
    .input(
      z.object({
        name: named,
        contact: contact.default(null),
        note: note.default(null),
        callsPerHour: callsPerHour.default(null),
      }),
    )
    .output(developerSchema)
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      await context.db.insert(developer).values({ id, ...input });

      const [made] = await described(context.db, id);
      if (!made) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return made;
    }),

  update: adminProcedure
    .route({
      method: "PATCH",
      path: "/developers/{id}",
      summary: "Change a developer account, suspend it, or resume it",
      description:
        `${ADMIN_ONLY} What is left out stays as it is. While an account is suspended none of ` +
        "its keys works. They work again once it is resumed, the revoked ones aside.",
      tags: ["Developer accounts"],
    })
    .input(
      z
        .object({
          id: z.uuid(),
          name: named.optional(),
          contact: contact.optional(),
          note: note.optional(),
          callsPerHour: callsPerHour.optional(),
          suspended: z.boolean().optional(),
        })
        .refine(
          (input) =>
            Object.entries(input).some(([name, value]) => name !== "id" && value !== undefined),
          "must name something to change",
        ),
    )
    .output(developerSchema)
    .handler(async ({ input, context }) => {
      const { id, suspended, ...values } = input;
      const changed = await context.db
        .update(developer)
        .set({
          ...values,
          // Suspending an account that already is keeps the time it was first suspended.
          ...(suspended === true && {
            suspendedAt: sql`coalesce(${developer.suspendedAt}, now())`,
          }),
          ...(suspended === false && { suspendedAt: null }),
        })
        .where(eq(developer.id, id))
        .returning({ id: developer.id });
      if (changed.length === 0) throw missing(id);

      const [now] = await described(context.db, id);
      if (!now) throw missing(id);
      return now;
    }),

  delete: adminProcedure
    .route({
      method: "DELETE",
      path: "/developers/{id}",
      summary: "Delete a developer account, with its keys and their counts",
      description:
        `${ADMIN_ONLY} Its keys stop working at once, and nothing of the account is kept. To ` +
        "stop an account and keep its history, suspend it instead.",
      tags: ["Developer accounts"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ id: z.string(), name: z.string() }))
    .handler(async ({ input, context }) => {
      const [deleted] = await context.db
        .delete(developer)
        .where(eq(developer.id, input.id))
        .returning({ id: developer.id, name: developer.name });
      if (!deleted) throw missing(input.id);
      return deleted;
    }),
};
