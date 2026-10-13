import { z } from "zod";
import { callerProcedure } from "../index";

// First visible use of a UTC day, including an app that stayed open overnight. The transport
// deduplicates by authenticated account (or anonymous device) and day, across devices/restarts.
export const activityRouter = {
  record: callerProcedure
    .meta({ analytics: "app_active" })
    .route({
      method: "POST",
      path: "/activity",
      summary: "Record daily app use",
      tags: ["Activity"],
    })
    .output(z.object({ ok: z.literal(true) }))
    .handler(() => ({ ok: true as const })),
};
