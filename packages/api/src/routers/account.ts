import { ORPCError } from "@orpc/server";
import type { AppleTokens } from "@repo/auth/apple-revocation";
import { isPassword, passwordHashOf } from "@repo/auth/password";
import { DELETED_USERNAME_DAYS, FRESH_SIGN_IN_MINUTES } from "@repo/config/account";
import { LOCALES } from "@repo/config/locales";
import type { Database } from "@repo/db";
import { holdAccounts } from "@repo/db/accounts";
import { countCalls } from "@repo/db/calls";
import { operator, removedUsername } from "@repo/db/schema/access";
import { account, session, user } from "@repo/db/schema/auth";
import { breakContribution } from "@repo/db/schema/community";
import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAction } from "../actions";
import { holdLine } from "../guides";
import { protectedProcedure } from "../index";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// What deleting an account asks of it: decision 071. Its password again, or, for an account
// that has none, a session opened in the last ten minutes. Five wrong passwords in an hour and
// it waits for the hour to end, so that a stolen session is not a way to guess the password.
const WRONG_PASSWORDS_AN_HOUR = 5;
// The name its tries are counted under, with its id: `account-delete:<id>`. The count goes with
// the others of `provider_calls`, within two days.
const DELETION_TRIES = "account-delete";

// The sign-in library keeps a session's moments in UTC, without saying so in the column: they are
// compared with the present moment in UTC, whatever zone the connection keeps.
const NOW_UTC = sql`(now() at time zone 'UTC')`;

const DAY_MS = 24 * 60 * 60 * 1000;

const isOperator = async (db: Pick<Database, "select">, userId: string) => {
  const [runs] = await db
    .select({ userId: operator.userId })
    .from(operator)
    .where(eq(operator.userId, userId));
  return runs !== undefined;
};

const runsTheInstance = () =>
  new ORPCError("CONFLICT", {
    message: "An operator's account is not deleted. Take its operator rights away first.",
  });

/**
 * Deletes what the account wrote that was never confirmed, each line held as decision 041
 * orders, after the account's row: what waits, what was refused or taken back, and what another
 * confirmation closed. Left to the cascade, they would stay with no name on them. What was
 * confirmed stays, and names nobody once the row of `user` goes.
 */
async function deleteUnconfirmed(tx: Transaction, userId: string) {
  const rows = await tx
    .select({
      id: breakContribution.id,
      breakRef: breakContribution.breakRef,
      line: breakContribution.line,
    })
    .from(breakContribution)
    .where(and(eq(breakContribution.userId, userId), ne(breakContribution.status, "confirmed")));
  // Each line once, always in the same order.
  const lines = [...new Set(rows.map((row) => `${row.breakRef}\u0000${row.line}`))].sort();
  for (const held of lines) {
    const [breakRef = "", line = ""] = held.split("\u0000");
    await holdLine(tx, breakRef, line);
  }
  if (rows.length === 0) return;
  await tx.delete(breakContribution).where(
    and(
      inArray(
        breakContribution.id,
        rows.map((row) => row.id),
      ),
      // What was confirmed meanwhile, before the line was held, stays.
      ne(breakContribution.status, "confirmed"),
    ),
  );
}

/** The links of an account to Apple that kept a token, which Apple asks to be revoked. */
async function appleLinksOf(tx: Transaction, userId: string): Promise<AppleTokens[]> {
  return tx
    .select({ refreshToken: account.refreshToken, accessToken: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "apple")));
}

export const accountRouter = {
  get: protectedProcedure
    .route({
      method: "GET",
      path: "/account",
      summary: "The caller's account, and whether it runs the instance",
      description:
        "Takes a signed-in session. The `id` is what `job operator` takes to make an account " +
        "an operator of the instance.",
      tags: ["Account"],
    })
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        // What others read of the account, on a line of a guide it wrote and among its
        // friends, in small letters. Null until it chooses one: decision 041.
        username: z.string().nullable(),
        email: z.string(),
        // An operator makes the API keys and reads what the instance keeps for its operator.
        isOperator: z.boolean(),
        // Whether the address was checked: someone who reads its mail followed the link.
        emailVerified: z.boolean(),
        // Whether this instance checks addresses. One that sends no mail does not.
        checksAddresses: z.boolean(),
        // Whether the account has a password: deleting it asks for it again, and an account
        // that signs in with another service alone signs in again instead. Decision 071.
        hasPassword: z.boolean(),
      }),
    )
    .handler(async ({ context }) => {
      const { id, name, email, emailVerified } = context.session.user;
      // The username is read where it is kept: the session's copy is as old as the session.
      const [found] = await context.db
        .select({ username: user.username, operatorId: operator.userId })
        .from(user)
        .leftJoin(operator, eq(operator.userId, user.id))
        .where(eq(user.id, id));
      return {
        id,
        name,
        username: found?.username ?? null,
        email,
        isOperator: found?.operatorId != null,
        emailVerified,
        checksAddresses: context.verification.isOn,
        hasPassword: (await passwordHashOf(context.db, id)) !== null,
      };
    }),

  sendVerification: protectedProcedure
    .meta({ analytics: "verification_requested" })
    .route({
      method: "POST",
      path: "/account/verification",
      summary: "Send the caller the mail that checks its address, again",
      description:
        "Takes a signed-in session. The mail holds a link, good for a day, which marks the " +
        "address as checked and opens the web app at `/verified`, or under the prefix of the " +
        "mail's language, such as `/fr/verified` for a mail in French. It signs no one in. The " +
        "answer is 409 when the address is already checked, 429 with `Retry-After` when the " +
        "account has had its mails for the hour or the day, and 503 when the instance sends " +
        "no mail, has sent its mails for the day, or its provider did not take this one: the " +
        "mail may still arrive then. Decision 026.",
      tags: ["Account"],
    })
    .input(z.object({ locale: z.enum(LOCALES).default("en") }))
    .output(z.object({ sent: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const { id, email, emailVerified } = context.session.user;
      if (emailVerified) {
        throw new ORPCError("CONFLICT", { message: "This address is already checked." });
      }

      const result = await context.verification.send({ id, email }, input.locale);
      if (result.sent) return { sent: true as const };
      if (result.why === "account") {
        context.reply.retryAfterSeconds = result.retryAfterSeconds;
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "This account was sent its mails for now. Try again later.",
        });
      }
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message:
          result.why === "off"
            ? "This instance sends no mail."
            : "The mail could not be sent. Try again later.",
      });
    }),

  delete: protectedProcedure
    .meta({ analytics: "account_deleted" })
    .route({
      method: "DELETE",
      path: "/account",
      summary: "Delete the caller's account, at once",
      description:
        "Takes a signed-in session, and `password` for an account that has one. An account " +
        "without one, which signs in with another service, shows a session opened in the " +
        `last ${FRESH_SIGN_IN_MINUTES} minutes: sign in again first. The answer is 403 for a ` +
        "wrong or missing password, with `data.refused` `password`, and for an older session, " +
        `with \`session\`; 429 with \`Retry-After\` after ${WRONG_PASSWORDS_AN_HOUR} wrong ` +
        "passwords in an hour, until it ends; 409 for an operator of the instance, whose " +
        "rights are taken away first. Every session, device, spot, list, alert, session of " +
        "the log with its photos, report and contribution that was never confirmed goes with " +
        "it. What it wrote that was confirmed stays in the guides, and names nobody. Its " +
        `username is nobody's for ${DELETED_USERNAME_DAYS} days. Decision 071.`,
      tags: ["Account"],
    })
    .input(z.object({ password: z.string().min(1).max(128).optional() }))
    .output(z.object({ deleted: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const { db } = context;
      // Refused before the password is tried, as decision 025 refuses to suspend one.
      if (await isOperator(db, userId)) throw runsTheInstance();

      const hash = await passwordHashOf(db, userId);
      if (hash !== null) {
        if (input.password === undefined) {
          throw new ORPCError("FORBIDDEN", {
            message: "Give the account's password again to delete it.",
            data: { refused: "password" },
          });
        }
        // Each try is counted before the password is compared, so that tries sent at once are
        // held to the limit too. A right one deletes the account, which then has no count.
        const full = await countCalls(db, [
          {
            provider: `${DELETION_TRIES}:${userId}`,
            bucket: "hour",
            span: "hour",
            limit: WRONG_PASSWORDS_AN_HOUR,
          },
        ]);
        if (full) {
          context.reply.retryAfterSeconds = full[0]?.retryAfterSeconds;
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "Too many wrong passwords. Try again once the hour is over.",
          });
        }
        if (!(await isPassword(hash, input.password))) {
          throw new ORPCError("FORBIDDEN", {
            message: "Wrong password.",
            data: { refused: "password" },
          });
        }
      } else {
        const [fresh] = await db
          .select({ id: session.id })
          .from(session)
          .where(
            and(
              eq(session.id, context.session.session.id),
              gt(
                session.createdAt,
                sql`${NOW_UTC} - make_interval(mins => ${FRESH_SIGN_IN_MINUTES})`,
              ),
            ),
          );
        if (!fresh) {
          throw new ORPCError("FORBIDDEN", {
            message: `Sign in again: an account is deleted from a session opened in the last ${FRESH_SIGN_IN_MINUTES} minutes.`,
            data: { refused: "session" },
          });
        }
      }

      const links = await db.transaction(async (tx) => {
        // The account first, as decision 041 orders: a change of its friends, of a score or of
        // what it has waiting waits for the deletion, or finds the account gone.
        await holdAccounts(tx, [userId]);
        // Made an operator meanwhile, by `job operator`.
        if (await isOperator(tx, userId)) throw runsTheInstance();
        await deleteUnconfirmed(tx, userId);
        const apple = await appleLinksOf(tx, userId);

        // Its username is nobody's for thirty days: no one takes it at once and passes for the
        // account. One that an operator took away for good stays so.
        const [had] = await tx
          .select({ username: user.username })
          .from(user)
          .where(eq(user.id, userId));
        if (had?.username) {
          const freeAt = new Date(Date.now() + DELETED_USERNAME_DAYS * DAY_MS);
          await tx
            .insert(removedUsername)
            .values({ username: had.username, freeAt })
            .onConflictDoUpdate({
              target: removedUsername.username,
              set: { at: new Date(), freeAt },
              setWhere: isNotNull(removedUsername.freeAt),
            });
        }

        // The operators' record keeps that it was deleted, and when, by its id alone. The
        // deletion sets the row's operator to null at once.
        await recordAction(tx, {
          operatorId: userId,
          action: "account.delete",
          developer: null,
          account: { id: userId },
        });
        // The database does the rest: what goes with the account, and what is set to null.
        await tx.delete(user).where(eq(user.id, userId));
        return apple;
      });

      // Apple is asked once for each link, once the account is gone, and its answer changes
      // nothing: the account was deleted.
      if (context.apple) {
        for (const tokens of links) await context.apple.revoke(tokens);
      }
      return { deleted: true as const };
    }),
};
