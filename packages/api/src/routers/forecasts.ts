import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { z } from "zod";

import { FORECAST_SOURCE, getForecast } from "@repo/conditions/forecasts/open-meteo";
import { callerProcedure } from "../index";

const measurement = z.number().nullable();

export const forecastsRouter = {
  get: callerProcedure
    .route({
      method: "GET",
      path: "/forecasts",
      summary: "Hourly wave, swell, and wind forecast at a point",
      tags: ["Forecasts"],
    })
    .input(
      z.object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        days: z.coerce.number().int().min(1).max(7).default(3),
        pastDays: z.coerce
          .number()
          .int()
          .min(0)
          .max(2)
          .default(0)
          .describe(
            "Days before today to add at the start. Their hours are what the models last " +
              "computed for them, not the forecast as it was first issued.",
          ),
      }),
    )
    .output(
      z.object({
        // The model grid point the forecast was computed for.
        point: z.object({ latitude: z.number(), longitude: z.number() }),
        source: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
        hours: z.array(
          z.object({
            time: z.date(),
            waveHeightMeters: measurement,
            wavePeriodSeconds: measurement,
            waveDirectionDegrees: measurement,
            swellHeightMeters: measurement,
            swellPeriodSeconds: measurement,
            swellDirectionDegrees: measurement,
            windWaveHeightMeters: measurement,
            windWavePeriodSeconds: measurement,
            windWaveDirectionDegrees: measurement,
            windSpeedMetersPerSecond: measurement,
            windGustMetersPerSecond: measurement,
            windDirectionDegrees: measurement,
          }),
        ),
      }),
    )
    .handler(async ({ input }) => {
      const result = await Effect.runPromise(Effect.result(getForecast(input)));
      if (Result.isFailure(result)) {
        console.error(result.failure);
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "The forecast provider did not answer. Try again in a moment.",
        });
      }
      if (!result.success) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for this point." });
      }

      return { ...result.success, source: FORECAST_SOURCE };
    }),
};
