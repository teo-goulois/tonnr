import { errorReportPause } from "@repo/db/schema/access";
import { z } from "zod";

import { recordAction } from "../actions";
import { errorReportsPausedAt } from "../error-reports";
import { adminProcedure, linkProcedure } from "../index";

const ADMIN_ONLY =
  "Takes the signed-in session of an operator of the instance, in a request that names the " +
  "admin's site in `Origin`. No key calls this: decision 020.";

export const errorReportsRouter = {
  get: linkProcedure
    .route({
      method: "GET",
      path: "/error-reports",
      summary: "Whether the web app sends error reports",
      description:
        "Takes neither a key nor a session. The web app sends an error report from a browser " +
        "whose person accepted the analytics and did not turn the reports off, until an " +
        "operator turns them off for every browser. Decision 054.",
      tags: ["Instance"],
    })
    .output(z.object({ on: z.boolean() }))
    .handler(async ({ context }) => ({ on: (await errorReportsPausedAt(context.db)) === null })),

  update: adminProcedure
    .route({
      method: "PUT",
      path: "/error-reports",
      summary: "Turn the web app's error reports off for every browser, or on again",
      description:
        `${ADMIN_ONLY} Off, the web app sends no error report, whatever a person chose, from ` +
        "the next page it loads. On, it sends them again from a browser whose person accepted " +
        "them. Turning off what is off changes nothing and records nothing, and so does " +
        "turning on what is on. The API's own fault reports do not depend on it.",
      tags: ["Instance"],
    })
    .input(z.object({ on: z.boolean() }))
    // Since when an operator has the reports off. Null while none has.
    .output(z.object({ pausedAt: z.date().nullable() }))
    .handler(async ({ input, context }) => {
      const operatorId = context.session.user.id;
      const pausedAt = await context.db.transaction(async (tx) => {
        if (input.on) {
          const [lifted] = await tx.delete(errorReportPause).returning({ id: errorReportPause.id });
          if (lifted) await recordAction(tx, { operatorId, action: "errors.on", developer: null });
        } else {
          const [written] = await tx
            .insert(errorReportPause)
            .values({ id: "instance" })
            .onConflictDoNothing()
            .returning({ id: errorReportPause.id });
          if (written) {
            await recordAction(tx, { operatorId, action: "errors.off", developer: null });
          }
        }
        return errorReportsPausedAt(tx);
      });
      return { pausedAt };
    }),
};
