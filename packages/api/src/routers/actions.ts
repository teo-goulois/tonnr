import { OPERATOR_ACTIONS, operatorAction } from "@repo/db/schema/access";
import { user } from "@repo/db/schema/auth";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

const changed = <Value extends z.ZodType>(value: Value) => z.object({ from: value, to: value });

const actionSchema = z.object({
  id: z.string(),
  at: z.date(),
  action: z.enum(OPERATOR_ACTIONS),
  // The operator who did it, by the name they have now. Null once their account is deleted.
  operatorName: z.string().nullable(),
  // The developer account it was done to, or whose key it was, with the name it had then. The
  // account may be gone since. Null for a key that had no developer account.
  developerId: z.string().nullable(),
  developerName: z.string().nullable(),
  // The key that was made or revoked. Null for what was done to an account.
  keyName: z.string().nullable(),
  // What an update changed. A contact and a note are only said to have changed.
  changes: z
    .object({
      name: changed(z.string()).optional(),
      callsPerHour: changed(z.number().nullable()).optional(),
      contact: z.literal(true).optional(),
      note: z.literal(true).optional(),
    })
    .nullable(),
});

export const actionsRouter = {
  list: adminProcedure
    .route({
      method: "GET",
      path: "/actions",
      summary: "What the operators did to the developer accounts and the keys, the latest first",
      description:
        `${ADMIN_ONLY} Each change made through the API is recorded with it: creating, ` +
        "changing, suspending, resuming and deleting a developer account, making and revoking " +
        "a key. A key is named and never shown. The commands run on the server are not " +
        "recorded: whoever runs them is no account. A record is kept thirteen months. Pages " +
        "follow one another through `after`.",
      tags: ["Operator actions"],
    })
    .input(
      z.object({
        // Only what was done to this developer account and to its keys.
        developerId: z.uuid().optional(),
        // The `next` of the page before.
        after: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    )
    .output(
      z.object({
        actions: z.array(actionSchema),
        // What to pass as `after` to get the actions that came before. Null on the last page.
        next: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      // The database compares the two moments itself: read here, the one of the page before
      // would lose what it holds under the millisecond.
      const after = input.after
        ? sql`(${operatorAction.at}, ${operatorAction.id}) < (
            select previous.at, previous.id from ${operatorAction} as previous
            where previous.id = ${input.after}
          )`
        : undefined;

      const rows = await context.db
        .select({
          id: operatorAction.id,
          at: operatorAction.at,
          action: operatorAction.action,
          operatorName: user.name,
          developerId: operatorAction.developerId,
          developerName: operatorAction.developerName,
          keyName: operatorAction.keyName,
          changes: operatorAction.changes,
        })
        .from(operatorAction)
        .leftJoin(user, eq(user.id, operatorAction.operatorId))
        .where(
          and(
            input.developerId ? eq(operatorAction.developerId, input.developerId) : undefined,
            after,
          ),
        )
        .orderBy(desc(operatorAction.at), desc(operatorAction.id))
        // One more than asked, to know whether a page follows.
        .limit(input.limit + 1);

      const actions = rows.slice(0, input.limit);
      return {
        actions,
        next: rows.length > input.limit ? (actions.at(-1)?.id ?? null) : null,
      };
    }),
};
