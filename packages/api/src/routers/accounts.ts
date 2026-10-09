import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { accountSuspension, operator } from "@repo/db/schema/access";
import { session, user } from "@repo/db/schema/auth";
import { and, count, desc, eq, gt, ilike, isNotNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import { adminProcedure } from "../index";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

// In a LIKE pattern these three characters have a meaning of their own.
function literal(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  // Whether the account's address was checked.
  emailVerified: z.boolean(),
  createdAt: z.date(),
  isOperator: z.boolean(),
  // Since when the account is suspended. Null for one that is not.
  suspendedAt: z.date().nullable(),
  // The sessions it has open, and when one of them was last opened or renewed: a session is
  // renewed about once a day while it is used. Null with no session open.
  sessions: z.number(),
  sessionRenewedAt: z.date().nullable(),
});

const accountId = z.object({ id: z.string().min(1).max(200) });

// The sign-in library keeps a session's end as a moment in UTC, without saying so in the
// column: it is compared with the present moment in UTC, whatever zone the connection keeps.
const NOW_UTC = sql`(now() at time zone 'UTC')`;

const noAccount = () => new ORPCError("NOT_FOUND", { message: "No such account." });

type Reader = Pick<Database, "select">;

/** An account as an operator sees it. Null when there is none. */
async function readAccount(db: Reader, id: string) {
  const [found] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      isOperator: isNotNull(operator.userId).mapWith(Boolean),
      suspendedAt: accountSuspension.at,
    })
    .from(user)
    .leftJoin(operator, eq(operator.userId, user.id))
    .leftJoin(accountSuspension, eq(accountSuspension.userId, user.id))
    .where(eq(user.id, id));
  if (!found) return null;

  // A session past its end is not one, whether the sign-in library has deleted it yet or not.
  const [open] = await db
    .select({ sessions: count(), sessionRenewedAt: max(session.updatedAt) })
    .from(session)
    .where(and(eq(session.userId, id), gt(session.expiresAt, NOW_UTC)));
  return {
    ...found,
    sessions: open?.sessions ?? 0,
    sessionRenewedAt: open?.sessionRenewedAt ?? null,
  };
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Holds an account's row until the transaction ends, so that what is done to the account is
 * done to one that still exists and that nothing else changes meanwhile: a sign-in that is
 * under way waits for it, and so does the command that names an operator. The hold leaves the
 * row free to be pointed at, as the record of an action points at the operator who did it:
 * two operators who close each other's sessions at the same moment do not wait for each
 * other. False when there is no such account.
 */
async function holdAccount(tx: Transaction, id: string) {
  const [held] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
    .for("no key update");
  return held !== undefined;
}

/** Closes every session of an account, and says how many of them were open. */
async function closeSessions(tx: Transaction, id: string) {
  const closed = await tx
    .delete(session)
    .where(eq(session.userId, id))
    .returning({ isOpen: sql<boolean>`${session.expiresAt} > ${NOW_UTC}` });
  return closed.filter((row) => row.isOpen).length;
}

export const accountsRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/accounts",
      summary: "The accounts that signed up, the newest first",
      description:
        `${ADMIN_ONLY} It gives each account's name and address, and nothing else of it: an ` +
        "operator reads who signed up, not what they keep. Pages follow one another through " +
        "`after`.",
      tags: ["Accounts"],
    })
    .input(
      z.object({
        // Part of the name or of the address, in any case.
        q: z.string().trim().min(1).max(80).optional(),
        // The `next` of the page before.
        after: z.string().min(1).max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    )
    .output(
      z.object({
        accounts: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            createdAt: z.date(),
            isOperator: z.boolean(),
            // Since when the account is suspended. Null for one that is not.
            suspendedAt: z.date().nullable(),
          }),
        ),
        // What to pass as `after` to get the accounts that follow. Null on the last page.
        next: z.string().nullable(),
        // How many accounts there are, or how many match `q`.
        total: z.number(),
      }),
    )
    .handler(async ({ input, context }) => {
      const pattern = input.q ? `%${literal(input.q)}%` : undefined;
      const matches = pattern
        ? or(ilike(user.name, pattern), ilike(user.email, pattern))
        : undefined;
      // The database compares the two moments itself: read here, the one of the page before
      // would lose what it holds under the millisecond.
      const after = input.after
        ? sql`(${user.createdAt}, ${user.id}) < (
            select previous.created_at, previous.id from ${user} as previous
            where previous.id = ${input.after}
          )`
        : undefined;

      const rows = await context.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          isOperator: isNotNull(operator.userId).mapWith(Boolean),
          suspendedAt: accountSuspension.at,
        })
        .from(user)
        .leftJoin(operator, eq(operator.userId, user.id))
        .leftJoin(accountSuspension, eq(accountSuspension.userId, user.id))
        .where(and(matches, after))
        .orderBy(desc(user.createdAt), desc(user.id))
        // One more than asked, to know whether a page follows.
        .limit(input.limit + 1);
      const [counted] = await context.db.select({ total: count() }).from(user).where(matches);

      const accounts = rows.slice(0, input.limit);
      return {
        accounts,
        next: rows.length > input.limit ? (accounts.at(-1)?.id ?? null) : null,
        total: counted?.total ?? 0,
      };
    }),

  get: adminProcedure
    .route({
      method: "GET",
      path: "/accounts/{id}",
      summary: "An account, as an operator sees it",
      description:
        `${ADMIN_ONLY} It gives who the account is, whether it is suspended, and how many ` +
        "sessions it has open. Nothing of what the account keeps, and nothing of where its " +
        "sessions came from.",
      tags: ["Accounts"],
    })
    .input(accountId)
    .output(accountSchema)
    .handler(async ({ input, context }) => {
      const found = await readAccount(context.db, input.id);
      if (!found) throw noAccount();
      return found;
    }),

  signOut: adminProcedure
    .route({
      method: "DELETE",
      path: "/accounts/{id}/sessions",
      summary: "Close every session of an account",
      description:
        `${ADMIN_ONLY} Each device of the account signs in again. It works on any account, an ` +
        "operator's and the caller's own included. A request already let in goes to its end, " +
        "and a sign-in that arrives at the same moment may open a session that stays: closing " +
        "sessions keeps nobody out, suspending does. Decision 025.",
      tags: ["Accounts"],
    })
    .input(accountId)
    .output(z.object({ closed: z.number() }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      const closed = await context.db.transaction(async (tx) => {
        if (!(await holdAccount(tx, input.id))) return null;
        const open = await closeSessions(tx, input.id);
        if (open > 0) {
          await recordAction(tx, {
            operatorId,
            action: "account.sign_out",
            developer: null,
            account: { id: input.id },
            changes: { sessions: open },
          });
        }
        return open;
      });
      if (closed === null) throw noAccount();
      return { closed };
    }),

  update: adminProcedure
    .route({
      method: "PATCH",
      path: "/accounts/{id}",
      summary: "Suspend an account, or let it in again",
      description:
        `${ADMIN_ONLY} A suspended account has its sessions closed and cannot sign in: the ` +
        "sign-in answers 403 with the code `ACCOUNT_SUSPENDED`. What it owns stays, and what " +
        "it shared stays visible. An operator is not suspended: the answer is 409. Letting an " +
        "account in again does not bring its sessions back. Decision 025.",
      tags: ["Accounts"],
    })
    .input(accountId.extend({ suspended: z.boolean() }))
    .output(accountSchema)
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      const account = { id: input.id };

      const found = await context.db.transaction(async (tx) => {
        if (!(await holdAccount(tx, input.id))) return null;

        if (input.suspended) {
          const [runs] = await tx.select().from(operator).where(eq(operator.userId, input.id));
          if (runs) {
            throw new ORPCError("CONFLICT", {
              message:
                "An operator is not suspended. Take the account's operator rights away first.",
            });
          }
          const [written] = await tx
            .insert(accountSuspension)
            .values({ userId: input.id, operatorId })
            .onConflictDoNothing()
            .returning({ userId: accountSuspension.userId });
          // Suspending an account that is suspended changes nothing, and records nothing.
          if (written) {
            await closeSessions(tx, input.id);
            await recordAction(tx, {
              operatorId,
              action: "account.suspend",
              developer: null,
              account,
            });
          }
        } else {
          const [lifted] = await tx
            .delete(accountSuspension)
            .where(eq(accountSuspension.userId, input.id))
            .returning({ userId: accountSuspension.userId });
          if (lifted) {
            await recordAction(tx, {
              operatorId,
              action: "account.resume",
              developer: null,
              account,
            });
          }
        }
        return readAccount(tx, input.id);
      });
      if (!found) throw noAccount();
      return found;
    }),
};
