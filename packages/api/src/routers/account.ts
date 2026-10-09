import { ORPCError } from "@orpc/server";
import { operator } from "@repo/db/schema/access";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

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
        email: z.string(),
        // An operator makes the API keys and reads what the instance keeps for its operator.
        isOperator: z.boolean(),
        // Whether the address was checked: someone who reads its mail followed the link.
        emailVerified: z.boolean(),
        // Whether this instance checks addresses. One that sends no mail does not.
        checksAddresses: z.boolean(),
      }),
    )
    .handler(async ({ context }) => {
      const { id, name, email, emailVerified } = context.session.user;
      const [found] = await context.db
        .select({ userId: operator.userId })
        .from(operator)
        .where(eq(operator.userId, id));
      return {
        id,
        name,
        email,
        isOperator: found !== undefined,
        emailVerified,
        checksAddresses: context.verification.isOn,
      };
    }),

  sendVerification: protectedProcedure
    .route({
      method: "POST",
      path: "/account/verification",
      summary: "Send the caller the mail that checks its address, again",
      description:
        "Takes a signed-in session. The mail holds a link, good for a day, which marks the " +
        "address as checked and opens the web app at `/verified`, or at `/fr/verified` for a " +
        "mail in French. It signs no one in. The " +
        "answer is 409 when the address is already checked, 429 with `Retry-After` when the " +
        "account has had its mails for the hour or the day, and 503 when the instance sends " +
        "no mail, has sent its mails for the day, or its provider did not take this one: the " +
        "mail may still arrive then. Decision 026.",
      tags: ["Account"],
    })
    .input(z.object({ locale: z.enum(["en", "fr"]).default("en") }))
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
};
