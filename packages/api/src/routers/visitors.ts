import { visitorClosure } from "@repo/db/schema/access";
import { z } from "zod";

import { recordAction } from "../actions";
import { adminProcedure, linkProcedure } from "../index";
import { visitorsClosedAt } from "../visitors";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

export const visitorsRouter = {
  get: linkProcedure
    .route({
      method: "GET",
      path: "/visitors",
      summary: "Whether the instance answers the visitors of its web app",
      description:
        "Takes neither a key nor a session. A visitor is whoever opens the web app without an " +
        "account: the API answers their requests, which name the web app's site in `Origin`, " +
        "with the data everyone shares, until an operator closes the instance to them. It " +
        "then answers them 401, with `visitors: closed` in the error's `data`, and the web " +
        "app asks for an account. A program calls with a key either way. Decision 039.",
      tags: ["Instance"],
    })
    .output(z.object({ open: z.boolean() }))
    .handler(async ({ context }) => ({ open: (await visitorsClosedAt(context.db)) === null })),

  update: adminProcedure
    .route({
      method: "PUT",
      path: "/visitors",
      summary: "Close the instance to the visitors of its web app, or open it to them again",
      description:
        `${ADMIN_ONLY} Closed, the instance answers the accounts, the keys and the links of ` +
        "shared lists as before, and no visitor: the web app asks them for an account. It " +
        "takes effect at the next call of each visitor. Closing an instance that is closed " +
        "changes nothing and records nothing, and so does opening one that is open.",
      tags: ["Instance"],
    })
    .input(z.object({ open: z.boolean() }))
    .output(
      z.object({
        open: z.boolean(),
        // Since when the instance answers no visitor. Null while it answers them.
        closedAt: z.date().nullable(),
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
      return { open: closedAt === null, closedAt };
    }),
};
