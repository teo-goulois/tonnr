import { ORPCError } from "@orpc/server";
import { FOLDING, fold } from "@repo/config/names";
import { surfBreak } from "@repo/db/schema/spots";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
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

// A break's name as a search reads it: in small letters and without its marks, as `fold` reads
// what is typed.
const foldedName = sql`translate(lower(${surfBreak.name}), ${FOLDING.marked}, ${FOLDING.plain})`;
/** The breaks whose name holds what is typed, whatever its case and its marks. */
const named = (q: string) => sql`${foldedName} like ${`%${literal(fold(q))}%`}`;
// The places a break lies in, read the same way: a break is also looked for by its town.
const foldedPlaces = sql`translate(lower(array_to_string(${surfBreak.location}, ' ')), ${FOLDING.marked}, ${FOLDING.plain})`;

// A number as a query string writes it. Nothing else is read as one.
const coordinate = (least: number, most: number) =>
  z.preprocess(
    (given) =>
      typeof given === "string" && /^-?\d+(\.\d+)?$/.test(given.trim()) ? Number(given) : given,
    z.number().min(least).max(most),
  );

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
        // Part of the name, in any case and with or without its marks.
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
            input.q ? named(input.q) : undefined,
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

  // A search and not a page of the catalogue: what is found is ranked, and none follows.
  search: callerProcedure
    .meta({ analytics: "break_searched" })
    .route({
      method: "GET",
      path: "/breaks/search",
      summary: "Surf breaks by their name or their town's, the likeliest first",
      description:
        'The breaks whose name holds `q`, whatever its case and its marks: "guethary" finds ' +
        '"Guéthary". A name that begins with it comes first, then one in which a word does, ' +
        "then one that holds it, and last the breaks of a place whose name holds it: a town " +
        "finds its breaks. " +
        "Given together, `latitude` and `longitude` bring forward the breaks nearest that " +
        "point among those, as the middle of a map does. No page follows: a search that " +
        "finds too many is typed further.",
      tags: ["Breaks"],
    })
    .input(
      z
        .object({
          q: z.string().trim().min(2).max(80),
          latitude: coordinate(-90, 90).optional(),
          longitude: coordinate(-180, 180).optional(),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        })
        .refine(
          (input) => (input.latitude === undefined) === (input.longitude === undefined),
          "latitude and longitude go together",
        ),
    )
    .output(z.object({ breaks: z.array(breakSchema) }))
    .handler(async ({ input, context }) => {
      const typed = literal(fold(input.q));
      // Where the name holds what is typed: at its start, at the start of a word, or elsewhere.
      // A break that only lies in a place of that name comes after those.
      const rank = sql`case
        when ${foldedName} like ${`${typed}%`} then 0
        when ${foldedName} like ${`% ${typed}%`} then 1
        when ${foldedName} like ${`%${typed}%`} then 2
        else 3
      end`;
      // How far a break is, near enough to order by: degrees on a flat earth, the short way
      // round the antimeridian.
      const { latitude, longitude } = input;
      const away =
        latitude !== undefined && longitude !== undefined
          ? sql`power(${surfBreak.latitude} - ${latitude}, 2) + power(
              (mod((${surfBreak.longitude} - ${longitude} + 540)::numeric, 360) - 180)
                * cos(radians(${latitude})),
              2
            )`
          : undefined;
      const rows = await context.db
        .select()
        .from(surfBreak)
        .where(or(named(input.q), sql`${foldedPlaces} like ${`%${typed}%`}`))
        .orderBy(rank, ...(away ? [away] : []), asc(surfBreak.name), asc(surfBreak.id))
        .limit(input.limit);
      const confirmed = await confirmedWordsOf(
        context.db,
        rows.map((row) => row.id),
      );
      return { breaks: rows.map((row) => describeBreak(row, confirmed.get(row.id))) };
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
