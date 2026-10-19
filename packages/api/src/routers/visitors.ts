import { FORECAST_PROVIDER } from "@repo/conditions/forecasts/open-meteo";
import { currentCalls } from "@repo/db/calls";
import { visitorClosure } from "@repo/db/schema/access";
import { z } from "zod";

import { recordAction } from "../actions";
import { adminProcedure, linkProcedure } from "../index";
import { answersVisitors, isDemandStrong, STRONG_DEMAND_AT, visitorsClosedAt } from "../visitors";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

export const visitorsRouter = {
  get: linkProcedure
    .route({
      method: "GET",
      path: "/visitors",
      summary: "Whether the instance answers the visitors of its own apps",
      description:
        "Takes neither a key nor a session. A visitor is whoever opens the web app, or the " +
        "instance's app for phones, without an account: the API answers their requests, which " +
        "name the web app's site in `Origin`, or the app's origin in `expo-origin`, " +
        "with the data everyone shares, until an operator closes the instance to them, or " +
        `demand is strong: once the instance has sent ${STRONG_DEMAND_AT} requests to its ` +
        "forecast provider in a day, UTC's, for the people who look, and until that day " +
        "ends. It then answers them 401, with `visitors: closed` in the error's `data`, and " +
        "the app asks for an account. A program calls with a key either way. Decisions 039 " +
        "and 069.",
      tags: ["Instance"],
    })
    .output(z.object({ open: z.boolean() }))
    .handler(async ({ context }) => ({ open: await answersVisitors(context.db) })),

  update: adminProcedure
    .route({
      method: "PUT",
      path: "/visitors",
      summary: "Close the instance to the visitors of its own apps, or open it to them again",
      description:
        `${ADMIN_ONLY} Closed, the instance answers the accounts, the keys and the links of ` +
        "shared lists as before, and no visitor: the apps ask them for an account. It " +
        "takes effect at the next call of each visitor. Closing an instance that is closed " +
        "changes nothing and records nothing, and so does opening one that is open. An " +
        "instance that an operator opens still answers no visitor while demand is strong: " +
        "`busy` says so.",
      tags: ["Instance"],
    })
    .input(z.object({ open: z.boolean() }))
    .output(
      z.object({
        // Whether the instance answers visitors now.
        open: z.boolean(),
        // Since when an operator has it answer none. Null while none has.
        closedAt: z.date().nullable(),
        // Whether demand is strong, which closes it by itself until the day ends, in UTC.
        busy: z.boolean(),
      }),
    )
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;

      const closedAt = await context.db.transaction(async (tx) => {
        if (input.open) {
          const [lifted] = await tx.delete(visitorClosure).returning({ id: visitorClosure.id });
          if (lifted) {
            await recordAction(tx, { operatorId, action: "visitors.open", developer: null });
          }
        } else {
          const [written] = await tx
            .insert(visitorClosure)
            .values({ id: "instance" })
            .onConflictDoNothing()
            .returning({ id: visitorClosure.id });
          if (written) {
            await recordAction(tx, { operatorId, action: "visitors.close", developer: null });
          }
        }
        return visitorsClosedAt(tx);
      });
      const busy = isDemandStrong(await currentCalls(context.db, FORECAST_PROVIDER));
      return { open: closedAt === null && !busy, closedAt, busy };
    }),
};
