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
  latitude: z.coerce.number().min(-90).max(90).describe("Decimal degrees, north positive."),
  longitude: z.coerce.number().min(-180).max(180).describe("Decimal degrees, east positive."),
  start: z.coerce.date().describe("The start of the period, ISO 8601 in UTC."),
  end: z.coerce
    .date()
    .describe(
      `The end of the period, ISO 8601 in UTC: after start, ${MAX_RANGE_DAYS} days at most.`,
    ),
};

function isValidRange({ start, end }: { start: Date; end: Date }) {
  const span = end.getTime() - start.getTime();
  return span > 0 && span <= MAX_RANGE_DAYS * DAY_MS;
}

const invalidRange = {
  path: ["end"],
  message: `end must be after start, and at most ${MAX_RANGE_DAYS} days later`,
};

export const tideStationSchema = z.object({
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
    .meta({
      mcp: {
        name: "get_tide_extremes",
        title: "High and low tides near a point",
        description:
          "The high and the low tides near a point between `start` and `end`, each with " +
          "its time in UTC and its height in metres above `datum`. They are predicted from " +
          `the nearest tide station, within ${MAX_STATION_DISTANCE_KM} km: \`station\` ` +
          "says which, how far it is (`distanceKm`), its source and its licence. NOT_FOUND " +
          "when no station is that near. This is the tool for when the tide is high or " +
          "low, and for the range of a tide: get_tide_timeline is for the height at a " +
          "given moment. On the Atlantic and Channel coasts of France and Spain a high " +
          "water also has its `coefficient`, from 20 at neap tides to 120 at the strongest " +
          "spring tides.",
      },
    })
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
            coefficient: z
              .number()
              .int()
              .nullable()
              .describe(
                "The tide's coefficient, from 20 to 120, as the tables of France and Spain " +
                  "print it, at a high water on their Atlantic and Channel coasts. Null elsewhere " +
                  "and at a low water.",
              ),
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
    .meta({
      mcp: {
        name: "get_tide_timeline",
        title: "The tide's height through a period",
        description:
          "The tide's height near a point at regular steps between `start` and `end`, in " +
          "metres above `datum`, predicted from the nearest tide station as " +
          "get_tide_extremes does. A step is 30 minutes unless `stepMinutes` says another, " +
          "from 5 to 60: a day is then 48 heights, so keep the period short. Use it to " +
          "say how high the water is at a given hour, or to find the hours when it stands " +
          "above or below a height.",
        defaults: { stepMinutes: 30 },
      },
    })
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
