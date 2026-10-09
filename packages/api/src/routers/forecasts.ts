import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { z } from "zod";

import { MAX_FORECAST_DAYS, MAX_PAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { FORECAST_SOURCE } from "@repo/conditions/forecasts/open-meteo";
import { callerProcedure } from "../index";

const measurement = z.number().nullable();

/** The answer when no forecast can be given: why, as far as a caller is told. */
export function forecastUnavailable(failure: { _tag: string }) {
  // Nothing was asked of the provider: the instance has reached what it lets itself ask.
  if (failure._tag === "BudgetSpent") {
    return new ORPCError("SERVICE_UNAVAILABLE", {
      message: "This instance has asked its forecast provider all it may for now. Try again later.",
    });
  }
  console.error(failure);
  return new ORPCError("SERVICE_UNAVAILABLE", {
    message: "The forecast provider did not answer. Try again in a moment.",
  });
}

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
        days: z.coerce.number().int().min(1).max(MAX_FORECAST_DAYS).default(3),
        pastDays: z.coerce
          .number()
          .int()
          .min(0)
          .max(MAX_PAST_DAYS)
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
        // When the instance fetched this forecast. It is not when the model ran.
        fetchedAt: z.date(),
        // True when the provider could not be asked and this is an older forecast, up to a
        // day old.
        stale: z.boolean(),
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
    .handler(async ({ input, context }) => {
      const result = await Effect.runPromise(Effect.result(context.forecasts.get(input)));
      if (Result.isFailure(result)) throw forecastUnavailable(result.failure);
      const { hours, ...forecast } = result.success;
      if (!hours) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for this point." });
      }

      return { ...forecast, hours, source: FORECAST_SOURCE };
    }),
};
