import { ORPCError } from "@orpc/server";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, eq, gt, ilike } from "drizzle-orm";
import { z } from "zod";

import { bboxSchema, inBbox } from "../bbox";
import { characteristicsSchema } from "../characteristics";
import type { WordLine } from "../community";
import { confirmedWordsOf } from "../guides";
import { callerProcedure } from "../index";

const breakSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  // A break of which only the place is known has ten nulls here. A list of words that an
  // account wrote and that was confirmed stands here in place of the list's: decision 041.
  // `GET /breaks/{id}/guide` says which.
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

// What the catalogue holds of a break, with what was confirmed of it laid over.
function describeBreak(
  row: typeof surfBreak.$inferSelect,
  confirmed: Partial<Record<WordLine, string[]>> = {},
) {
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
      // The words of a contribution are the catalogue's: they were checked when it was
      // written, and the answer is checked again as it leaves.
      ...(confirmed as Partial<z.infer<typeof characteristicsSchema>>),
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
        "Of the spots users created, the catalogue holds those an operator accepted to make " +
        "public, with `community` as their provider. Pages follow one another through `after`, " +
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
      // One more query for the page, whatever its length.
      const confirmed = await confirmedWordsOf(
        context.db,
        page.map((row) => row.id),
      );
      return {
        breaks: page.map((row) => describeBreak(row, confirmed.get(row.id))),
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
      return describeBreak(row, (await confirmedWordsOf(context.db, [row.id])).get(row.id));
    }),
};
