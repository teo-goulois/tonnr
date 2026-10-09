import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import {
  accountSuspension,
  apiKey,
  developer,
  developerCalls,
  developerMember,
  type OperatorChanges,
} from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
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

const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  // Whether the account's address was checked. It says nothing of who holds the account.
  emailVerified: z.boolean(),
  // Since when the account is suspended: it reads nothing while it is. Null otherwise.
  suspendedAt: z.date().nullable(),
  addedAt: z.date(),
});

/** The members of a developer account, the first added first. */
function membersOf(db: Pick<Database, "select">, developerId: string) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      suspendedAt: accountSuspension.at,
      addedAt: developerMember.addedAt,
    })
    .from(developerMember)
    .innerJoin(user, eq(user.id, developerMember.userId))
    .leftJoin(accountSuspension, eq(accountSuspension.userId, user.id))
    .where(eq(developerMember.developerId, developerId))
    .orderBy(asc(developerMember.addedAt), asc(user.id));
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
      await context.db.transaction(async (tx) => {
        await tx.insert(developer).values({ id, ...input });
        await recordAction(tx, {
          operatorId: context.session.user.id,
          action: "developer.create",
          developer: { id, name: input.name },
          ...(input.callsPerHour !== null && {
            changes: { callsPerHour: { from: null, to: input.callsPerHour } },
          }),
        });
      });

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
      const operatorId = context.session.user.id;

      const found = await context.db.transaction(async (tx) => {
        // The account as it is, held until the change is made: the record says what it changed.
        const [before] = await tx
          .select()
          .from(developer)
          .where(eq(developer.id, id))
          .for("update");
        if (!before) return false;

        const changes: OperatorChanges = {};
        if (values.name !== undefined && values.name !== before.name) {
          changes.name = { from: before.name, to: values.name };
        }
        if (values.callsPerHour !== undefined && values.callsPerHour !== before.callsPerHour) {
          changes.callsPerHour = { from: before.callsPerHour, to: values.callsPerHour };
        }
        if (values.contact !== undefined && values.contact !== before.contact)
          changes.contact = true;
        if (values.note !== undefined && values.note !== before.note) changes.note = true;
        const isSuspended = before.suspendedAt !== null;
        const turns = suspended !== undefined && suspended !== isSuspended;
        const changed = Object.keys(changes).length > 0;
        // Asking for what is already so changes nothing, and is not recorded.
        if (!changed && !turns) return true;

        await tx
          .update(developer)
          .set({
            ...values,
            ...(turns && { suspendedAt: suspended ? sql`now()` : null }),
          })
          .where(eq(developer.id, id));
        // The record names the account as it is called once the change is made.
        const named = { id, name: values.name ?? before.name };
        if (changed) {
          await recordAction(tx, {
            operatorId,
            action: "developer.update",
            developer: named,
            changes,
          });
        }
        if (turns) {
          const action = suspended ? "developer.suspend" : "developer.resume";
          await recordAction(tx, { operatorId, action, developer: named });
        }
        return true;
      });
      if (!found) throw missing(id);

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
      const deleted = await context.db.transaction(async (tx) => {
        const [gone] = await tx
          .delete(developer)
          .where(eq(developer.id, input.id))
          .returning({ id: developer.id, name: developer.name });
        if (!gone) return null;

        await recordAction(tx, {
          operatorId: context.session.user.id,
          action: "developer.delete",
          developer: gone,
        });
        return gone;
      });
      if (!deleted) throw missing(input.id);
      return deleted;
    }),

  members: adminProcedure
    .route({
      method: "GET",
      path: "/developers/{id}/members",
      summary: "The accounts that may read a developer account in the console",
      description:
        `${ADMIN_ONLY} A member reads the account's name, its limit, its keys by name and ` +
        "their calls, and changes nothing. Decision 027.",
      tags: ["Developer accounts"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ members: z.array(memberSchema) }))
    .handler(async ({ input, context }) => {
      const [found] = await context.db
        .select({ id: developer.id })
        .from(developer)
        .where(eq(developer.id, input.id));
      if (!found) throw missing(input.id);
      return { members: await membersOf(context.db, input.id) };
    }),

  addMember: adminProcedure
    .route({
      method: "POST",
      path: "/developers/{id}/members",
      summary: "Let an account read a developer account in the console",
      description:
        `${ADMIN_ONLY} The account is named by its identifier, which the list of accounts ` +
        "gives. An address proves nothing of who holds an account, checked or not: name the " +
        "account you know to be theirs. Adding a member that is one already changes nothing.",
      tags: ["Developer accounts"],
    })
    .input(z.object({ id: z.uuid(), accountId: z.string().min(1).max(200) }))
    .output(z.object({ members: z.array(memberSchema) }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      await context.db.transaction(async (tx) => {
        // Both are held until the member is written. The developer account is neither renamed
        // nor deleted meanwhile, and the account is not deleted: nothing else of it is held,
        // so that it signs in and is suspended as before.
        const [held] = await tx
          .select({ id: developer.id, name: developer.name })
          .from(developer)
          .where(eq(developer.id, input.id))
          .for("share");
        if (!held) throw missing(input.id);
        const [account] = await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, input.accountId))
          .for("key share");
        if (!account) throw new ORPCError("NOT_FOUND", { message: "No such account." });

        const [added] = await tx
          .insert(developerMember)
          .values({ developerId: input.id, userId: input.accountId, operatorId })
          .onConflictDoNothing()
          .returning({ userId: developerMember.userId });
        if (added) {
          await recordAction(tx, {
            operatorId,
            action: "developer.member_add",
            developer: held,
            account: { id: input.accountId },
          });
        }
      });
      return { members: await membersOf(context.db, input.id) };
    }),

  removeMember: adminProcedure
    .route({
      method: "DELETE",
      path: "/developers/{id}/members/{accountId}",
      summary: "Take the console of a developer account from an account",
      description:
        `${ADMIN_ONLY} The account reads nothing of the developer account from its next ` +
        "call. Removing one that is no member changes nothing.",
      tags: ["Developer accounts"],
    })
    .input(z.object({ id: z.uuid(), accountId: z.string().min(1).max(200) }))
    .output(z.object({ members: z.array(memberSchema) }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      await context.db.transaction(async (tx) => {
        const [held] = await tx
          .select({ id: developer.id, name: developer.name })
          .from(developer)
          .where(eq(developer.id, input.id))
          .for("share");
        if (!held) throw missing(input.id);

        const [removed] = await tx
          .delete(developerMember)
          .where(
            and(
              eq(developerMember.developerId, input.id),
              eq(developerMember.userId, input.accountId),
            ),
          )
          .returning({ userId: developerMember.userId });
        if (removed) {
          await recordAction(tx, {
            operatorId,
            action: "developer.member_remove",
            developer: held,
            account: { id: input.accountId },
          });
        }
      });
      return { members: await membersOf(context.db, input.id) };
    }),
};
