import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { z } from "zod";

import { MAX_FORECAST_DAYS, MAX_PAST_DAYS } from "@repo/conditions/forecasts/forecasts";
import { forecastSource, waveModel } from "@repo/conditions/forecasts/wave-models";
import { callerProcedure } from "../index";

const measurement = z.number().nullable();

/**
 * Who a forecast is credited to. `credits` are to be shown as links beside the data, with
 * `notice` when there is one. `attribution` says the same as one text.
 */
export const forecastSourceSchema = z.object({
  name: z.string(),
  url: z.string(),
  attribution: z.string(),
  license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
  credits: z.array(z.object({ text: z.string(), url: z.string() })),
  notice: z.string().nullable(),
});

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
      summary: "Hourly wave, wind, and weather forecast at a point",
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
        source: forecastSourceSchema,
        // The models the waves come from, in the order of the hours: each answers from its
        // `from` to the next one's. A finer model has the first days where it has its sea, and
        // another the days after its last hour.
        waveModels: z.array(
          z.object({
            name: z.string(),
            producer: z.string(),
            resolutionKilometers: z.number(),
            from: z.date(),
          }),
        ),
        // The models the swell apart comes from, listed the same way. Empty when no model gives
        // one at the point.
        swellModels: z.array(
          z.object({
            name: z.string(),
            producer: z.string(),
            resolutionKilometers: z.number(),
            from: z.date(),
          }),
        ),
        // When the instance fetched this forecast. It is not when the model ran.
        fetchedAt: z.date(),
        // True when the provider could not be asked and this is an older forecast, up to a
        // day old.
        stale: z.boolean(),
        hours: z.array(
          z.object({
            time: z.date(),
            // The whole sea, swell and wind sea together, as a buoy measures it.
            waveHeightMeters: measurement,
            // Its mean period.
            wavePeriodSeconds: measurement,
            // The period of its peak, the one a buoy gives as its peak period. Null at every
            // hour when the model gives none.
            wavePeakPeriodSeconds: measurement,
            waveDirectionDegrees: measurement,
            // The first swell apart from the wind sea: its height, and where it comes from. It
            // is less sure than the whole sea, and null where no model gives one.
            primarySwellHeightMeters: measurement,
            primarySwellDirectionDegrees: measurement,
            windSpeedMetersPerSecond: measurement,
            windGustMetersPerSecond: measurement,
            windDirectionDegrees: measurement,
            // The share of the sky under cloud, from 0 to 100.
            cloudCoverPercent: measurement,
            // Rain, showers and snow of the hour before.
            precipitationMillimeters: measurement,
            airTemperatureCelsius: measurement,
          }),
        ),
      }),
    )
    .handler(async ({ input, context }) => {
      const result = await Effect.runPromise(Effect.result(context.forecasts.get(input)));
      if (Result.isFailure(result)) throw forecastUnavailable(result.failure);
      const { hours, models, swellModels, ...forecast } = result.success;
      if (!hours || models.length === 0) {
        throw new ORPCError("NOT_FOUND", { message: "No sea forecast for this point." });
      }

      const named = (list: typeof models) =>
        list.map(({ id, from }) => {
          const { name, producer, resolutionKilometers } = waveModel(id);
          return { name, producer, resolutionKilometers, from };
        });
      return {
        ...forecast,
        hours,
        source: forecastSource([...models, ...swellModels].map((model) => model.id)),
        waveModels: named(models),
        swellModels: named(swellModels),
      };
    }),
};
