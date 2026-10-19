import { z } from "zod";

import { NO_CLIENTS } from "../clients";
import { linkProcedure } from "../index";

const clientSchema = z.object({
  // The oldest build the instance still answers. Null while it answers every build.
  oldestBuild: z.number().int().positive().nullable(),
  // The newest build the store sells. Null while the instance does not say.
  newestBuild: z.number().int().positive().nullable(),
  // The app's page in its store. Null while no store sells it.
  storeUrl: z.url().nullable(),
});

export const clientsRouter = {
  get: linkProcedure
    .route({
      method: "GET",
      path: "/clients",
      summary: "Which builds of the apps for phones the instance answers",
      description:
        "Takes neither a key nor a session, and answers while the instance is closed to " +
        "visitors too. For each platform, `ios` and `android`: the oldest build the instance " +
        "still answers, the newest build its store sells, and the app's page in that store. " +
        "A build is the number an app sends after its version in `X-App`, the same on both " +
        "platforms. An app older than the oldest asks to be updated, and goes no further. A " +
        "null says nothing: every build is answered, or no store is named. Decision 069.",
      tags: ["Instance"],
    })
    .output(z.object({ ios: clientSchema, android: clientSchema }))
    .handler(({ context }) => context.server.clients ?? NO_CLIENTS),
};
