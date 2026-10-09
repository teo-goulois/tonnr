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
      }),
    )
    .handler(async ({ context }) => {
      const { id, name, email } = context.session.user;
      const [found] = await context.db
        .select({ userId: operator.userId })
        .from(operator)
        .where(eq(operator.userId, id));
      return { id, name, email, isOperator: found !== undefined };
    }),
};
