import { operator } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { and, count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

// In a LIKE pattern these three characters have a meaning of their own.
function literal(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
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
        })
        .from(user)
        .leftJoin(operator, eq(operator.userId, user.id))
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
};
