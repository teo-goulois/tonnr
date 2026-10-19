import { ORPCError } from "@orpc/server";
import { isPassword, passwordHashOf } from "@repo/auth/password";
import { DELETED_USERNAME_DAYS, FRESH_SIGN_IN_MINUTES } from "@repo/config/account";
import { LOCALES } from "@repo/config/locales";
import { countCalls } from "@repo/db/calls";
import { deleteAccount, isOperator } from "@repo/db/deletion";
import { operator } from "@repo/db/schema/access";
import { account, session, user } from "@repo/db/schema/auth";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

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

// The services an account may sign in with besides a password, as the sign-in library names
// them: decisions 046 and 070.
const SIGN_IN_SERVICES = ["apple", "google"] as const;

const runsTheInstance = () =>
  new ORPCError("CONFLICT", {
    message: "An operator's account is not deleted. Take its operator rights away first.",
  });

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
        // The services the account signs in with besides a password, which it signs in again
        // with before it is deleted: decisions 070 and 071.
        signsInWith: z.array(z.enum(SIGN_IN_SERVICES)),
      }),
    )
    .handler(async ({ context }) => {
      const { id, name, email, emailVerified } = context.session.user;
      // The username is read where it is kept: the session's copy is as old as the session.
      const [[found], links] = await Promise.all([
        context.db
          .select({ username: user.username, operatorId: operator.userId })
          .from(user)
          .leftJoin(operator, eq(operator.userId, user.id))
          .where(eq(user.id, id)),
        context.db
          .select({ providerId: account.providerId })
          .from(account)
          .where(and(eq(account.userId, id), inArray(account.providerId, SIGN_IN_SERVICES))),
      ]);
      return {
        id,
        name,
        username: found?.username ?? null,
        email,
        isOperator: found?.operatorId != null,
        emailVerified,
        checksAddresses: context.verification.isOn,
        hasPassword: (await passwordHashOf(context.db, id)) !== null,
        signsInWith: SIGN_IN_SERVICES.filter((service) =>
          links.some((link) => link.providerId === service),
        ),
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

      // What goes and what stays is `deleteAccount`'s, which `job account-delete` runs too.
      const outcome = await db.transaction((tx) =>
        deleteAccount(tx, userId, { action: "account.delete", operatorId: userId }),
      );
      if (!outcome.deleted) {
        if (outcome.why === "operator") throw runsTheInstance();
        throw new ORPCError("NOT_FOUND", { message: "This account was deleted already." });
      }

      // Apple is asked once for each link, once the account is gone, and its answer changes
      // nothing: the account was deleted.
      if (context.apple) {
        for (const tokens of outcome.apple) await context.apple.revoke(tokens);
      }
      return { deleted: true as const };
    }),
};
