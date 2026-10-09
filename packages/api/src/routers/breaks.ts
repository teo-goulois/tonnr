import { ORPCError } from "@orpc/server";
import {
  ABILITY_LEVELS,
  BOARD_TYPES,
  BOTTOM_TYPES,
  BREAK_TYPES,
  COMPASS_POINTS,
  SEASONS,
  surfBreak,
  TIDE_STAGES,
  WAVE_DIRECTIONS,
} from "@repo/db/schema/spots";
import { and, asc, eq, gt, ilike } from "drizzle-orm";
import { z } from "zod";

import { bboxSchema, inBbox } from "../bbox";
import { callerProcedure } from "../index";

// Null where nobody has said: a break of which only the place is known has nine nulls here.
const characteristicsSchema = z.object({
  breakTypes: z.array(z.enum(BREAK_TYPES)).nullable(),
  waveDirections: z.array(z.enum(WAVE_DIRECTIONS)).nullable(),
  bottomTypes: z.array(z.enum(BOTTOM_TYPES)).nullable(),
  abilityLevels: z.array(z.enum(ABILITY_LEVELS)).nullable(),
  boardTypes: z.array(z.enum(BOARD_TYPES)).nullable(),
  bestSeasons: z.array(z.enum(SEASONS)).nullable(),
  bestTides: z.array(z.enum(TIDE_STAGES)).nullable(),
  // Where the swell and the wind come from when the break works, as points of the compass.
  bestSwellDirections: z.array(z.enum(COMPASS_POINTS)).nullable(),
  bestWindDirections: z.array(z.enum(COMPASS_POINTS)).nullable(),
  // Where the wind blows from when it blows off the shore, clockwise from north.
  offshoreDirectionDegrees: z.number().nullable(),
});

const breakSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  characteristics: characteristicsSchema,
  // The places the break lies in, from the widest to the nearest.
  location: z.array(z.string()).nullable(),
  // The IANA name of the time zone.
  timezone: z.string().nullable(),
  // Where the break was read. Each field is null when the instance does not say.
  source: z.object({
    provider: z.string().nullable(),
    // The page that shows the break.
    url: z.string().nullable(),
    attribution: z.string().nullable(),
    license: z.object({ type: z.string(), url: z.string() }).nullable(),
  }),
});

function describeBreak(row: typeof surfBreak.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    characteristics: {
      breakTypes: row.breakTypes,
      waveDirections: row.waveDirections,
      bottomTypes: row.bottomTypes,
      abilityLevels: row.abilityLevels,
      boardTypes: row.boardTypes,
      bestSeasons: row.bestSeasons,
      bestTides: row.bestTides,
      bestSwellDirections: row.bestSwellDirections,
      bestWindDirections: row.bestWindDirections,
      offshoreDirectionDegrees: row.offshoreDirectionDegrees,
    },
    location: row.location,
    timezone: row.timezone,
    source: {
      provider: row.provider,
      url: row.sourceUrl,
      attribution: row.attribution,
      license:
        row.licenseType && row.licenseUrl ? { type: row.licenseType, url: row.licenseUrl } : null,
    },
  };
}

// In a LIKE pattern these three characters have a meaning of their own.
function literal(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const breaksRouter = {
  list: callerProcedure
    .route({
      method: "GET",
      path: "/breaks",
      summary: "The catalogue of surf breaks, in an area or by name",
      description:
        "The breaks the instance knows, to pick a spot from, each with what is known of it. " +
        "The catalogue holds no spot a user created. Pages follow one another through `after`, " +
        "so the whole catalogue can be read.",
      tags: ["Breaks"],
    })
    .input(
      z.object({
        bbox: bboxSchema.optional(),
        // Part of the name, in any case.
        q: z.string().trim().min(2).max(80).optional(),
        // The `next` of the page before.
        after: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(2000).default(500),
      }),
    )
    .output(
      z.object({
        breaks: z.array(breakSchema),
        // What to pass as `after` to get the breaks that follow. Null on the last page.
        next: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      const rows = await context.db
        .select()
        .from(surfBreak)
        .where(
          and(
            inBbox(surfBreak.latitude, surfBreak.longitude, input.bbox),
            input.q ? ilike(surfBreak.name, `%${literal(input.q)}%`) : undefined,
            input.after ? gt(surfBreak.id, input.after) : undefined,
          ),
        )
        .orderBy(asc(surfBreak.id))
        // One more than asked, to know whether a page follows.
        .limit(input.limit + 1);

      const page = rows.slice(0, input.limit);
      return {
        breaks: page.map(describeBreak),
        next: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    }),

  get: callerProcedure
    .route({
      method: "GET",
      path: "/breaks/{id}",
      summary: "One surf break of the catalogue",
      tags: ["Breaks"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(breakSchema)
    .handler(async ({ input, context }) => {
      const [row] = await context.db.select().from(surfBreak).where(eq(surfBreak.id, input.id));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No break "${input.id}".` });
      return describeBreak(row);
    }),
};
