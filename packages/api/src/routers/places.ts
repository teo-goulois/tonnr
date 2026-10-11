import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { PLACES_SOURCE } from "../places";
import { hasControlCharacter } from "../text";

// A number as a query string writes it, or as JSON does. Nothing else is read as one: `null`
// is not zero, and `true` is not one.
const numeric = <Checked extends z.ZodType<number, number>>(checked: Checked) =>
  z
    .union([
      z.number(),
      z
        .string()
        .trim()
        .regex(/^-?\d+(\.\d+)?$/)
        .transform(Number),
    ])
    .pipe(checked);

const placeSchema = z.object({
  name: z.string(),
  // The places it lies in, from the widest to the nearest.
  location: z.array(z.string()),
  latitude: z.number(),
  longitude: z.number(),
});

export const placesRouter = {
  // An account's and not a key's: the search is a tool to place a spot, and the places are a
  // service's that the instance asks, not data it holds. Decision 030.
  search: protectedProcedure
    .route({
      method: "GET",
      path: "/places",
      summary: "Places by their name, to find a point of the map",
      description:
        "Towns, beaches, streets and addresses of OpenStreetMap whose name matches. Given " +
        "together, `latitude` and `longitude` bring forward the places near that point. The " +
        "instance asks a search service for them and keeps nothing of a search. An account " +
        "may search so many times a minute: beyond, the answer is 429. It is 503 when the " +
        "service fails and while it is then left alone. Both say in `Retry-After` when to " +
        "ask again.",
      tags: ["Places"],
    })
    .input(
      z
        .object({
          // Part of the name, as the catalogue of breaks takes it.
          q: z
            .string()
            .trim()
            .min(2)
            .max(120)
            .refine((q) => !hasControlCharacter(q), "must not contain control characters"),
          latitude: numeric(z.number().min(-90).max(90)).optional(),
          longitude: numeric(z.number().min(-180).max(180)).optional(),
          // The language the names are wanted in, where a place has one in it.
          locale: z.enum(["en", "fr"]).optional(),
          limit: numeric(z.number().int().min(1).max(10)).default(5),
        })
        .refine(
          (input) => (input.latitude === undefined) === (input.longitude === undefined),
          "latitude and longitude go together",
        ),
    )
    .output(
      z.object({
        places: z.array(placeSchema),
        source: z.object({
          name: z.string(),
          url: z.string(),
          attribution: z.string(),
          license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
        }),
      }),
    )
    .handler(async ({ input, context }) => {
      const { q, latitude, longitude, locale, limit } = input;
      const near =
        latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
      const result = await Effect.runPromise(
        Effect.result(
          context.places.search({ query: q, near, locale, limit }, context.session.user.id),
        ),
      );
      if (Result.isSuccess(result)) return { places: result.success, source: PLACES_SOURCE };

      const failure = result.failure;
      if (failure._tag === "PlacesBusy") {
        context.reply.retryAfterSeconds = failure.retryAfterSeconds;
        throw failure.byAccount
          ? new ORPCError("TOO_MANY_REQUESTS", {
              message: "Too many searches for now. Try again in a moment.",
            })
          : new ORPCError("SERVICE_UNAVAILABLE", {
              message: "The search of places is resting. Try again in a moment.",
            });
      }
      // The address that was asked holds what the caller typed: the log gets the status alone.
      console.error(`places: the search service answered ${failure.status ?? "no list of places"}`);
      if (failure.retryAfterSeconds !== undefined) {
        context.reply.retryAfterSeconds = failure.retryAfterSeconds;
      }
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "The search of places did not answer. Try again in a moment.",
      });
    }),
};
