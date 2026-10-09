import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { z } from "zod";

import { getWaveMap, WAVE_MAP_SOURCE } from "@repo/conditions/forecasts/copernicus-wave-map";
import { publicProcedure } from "../index";

export const mapsRouter = {
  waveHeight: publicProcedure
    .route({
      method: "GET",
      path: "/maps/wave-height",
      summary: "Where to get map tiles of the significant wave height, and how to read them",
      tags: ["Maps"],
    })
    .output(
      z.object({
        // `{z}`, `{x}`, `{y}`, and `{time}` are placeholders. `{time}` takes one of `times`,
        // written as ISO 8601 in UTC.
        tileUrlTemplate: z.string(),
        tileSize: z.literal(256),
        minZoom: z.number(),
        maxZoom: z.number(),
        // How a pixel says a height: `metersByLevel` at the level of its red channel, 0 to 255.
        // The levels are not evenly spaced between `minMeters` and `maxMeters`, a height above
        // `maxMeters` gives the last level, and a pixel is transparent where the model has no sea.
        encoding: z.object({
          type: z.literal("grayscale"),
          minMeters: z.number(),
          maxMeters: z.number(),
          metersByLevel: z.array(z.number()).length(256),
        }),
        // The moments the model has a field for: every `stepSeconds` from `start` to `end`.
        times: z.object({ start: z.date(), end: z.date(), stepSeconds: z.number() }),
        source: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
      }),
    )
    .handler(async () => {
      const result = await Effect.runPromise(Effect.result(getWaveMap()));
      if (Result.isFailure(result)) {
        // The provider did not answer, or its answer has changed and the module must be read again.
        console.error(result.failure);
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "The wave map is not available right now. Try again in a moment.",
        });
      }

      return { ...result.success, source: WAVE_MAP_SOURCE };
    }),
};
