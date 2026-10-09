import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { callerProcedure } from "../index";
import {
  MAX_STATION_DISTANCE_KM,
  predictTideExtremes,
  predictTideTimeline,
} from "@repo/conditions/tides/tide-prediction";

const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

const tideQueryShape = {
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  start: z.coerce.date(),
  end: z.coerce.date(),
};

function isValidRange({ start, end }: { start: Date; end: Date }) {
  const span = end.getTime() - start.getTime();
  return span > 0 && span <= MAX_RANGE_DAYS * DAY_MS;
}

const invalidRange = {
  path: ["end"],
  message: `end must be after start, and at most ${MAX_RANGE_DAYS} days later`,
};

const tideStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  distanceKm: z.number(),
  source: z.object({ name: z.string(), url: z.string() }),
  license: z.object({ type: z.string(), url: z.string(), commercialUse: z.boolean() }),
});

function noStationNearby() {
  return new ORPCError("NOT_FOUND", {
    message: `No tide station within ${MAX_STATION_DISTANCE_KM} km of this point.`,
  });
}

export const tidesRouter = {
  extremes: callerProcedure
    .route({
      method: "GET",
      path: "/tides/extremes",
      summary: "High and low tides near a point",
      tags: ["Tides"],
    })
    .input(z.object(tideQueryShape).refine(isValidRange, invalidRange))
    .output(
      z.object({
        station: tideStationSchema,
        datum: z.string(),
        extremes: z.array(
          z.object({
            time: z.date(),
            type: z.enum(["high", "low"]),
            heightMeters: z.number(),
          }),
        ),
      }),
    )
    .handler(({ input }) => {
      const prediction = predictTideExtremes(input);
      if (!prediction) throw noStationNearby();
      return prediction;
    }),

  timeline: callerProcedure
    .route({
      method: "GET",
      path: "/tides/timeline",
      summary: "Tide height at regular intervals near a point",
      tags: ["Tides"],
    })
    .input(
      z
        .object({
          ...tideQueryShape,
          stepMinutes: z.coerce.number().int().min(5).max(60).default(10),
        })
        .refine(isValidRange, invalidRange),
    )
    .output(
      z.object({
        station: tideStationSchema,
        datum: z.string(),
        timeline: z.array(z.object({ time: z.date(), heightMeters: z.number() })),
      }),
    )
    .handler(({ input }) => {
      const prediction = predictTideTimeline(input);
      if (!prediction) throw noStationNearby();
      return prediction;
    }),
};
