import { ORPCError } from "@orpc/server";
import { SURF_FACES, sizeRank } from "@repo/conditions/sessions/sizes";
import { FORECAST_READINGS, surferProfile } from "@repo/db/schema/profile";
import { SURF_SIZES } from "@repo/db/schema/sessions";
import { ABILITY_LEVELS, BOARD_TYPES } from "@repo/db/schema/spots";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

// What an account said of itself as a surfer: decision 063.

const answersSchema = z.object({
  level: z.enum(ABILITY_LEVELS).nullable(),
  // The waves the account surfs, from the smallest to the biggest, said against a surfer
  // standing beside them, as a session says them.
  smallestWave: z.enum(SURF_SIZES).nullable(),
  biggestWave: z.enum(SURF_SIZES).nullable(),
  reading: z.enum(FORECAST_READINGS).nullable(),
  boards: z.array(z.enum(BOARD_TYPES)).max(BOARD_TYPES.length).nullable(),
});

const profileSchema = answersSchema.extend({
  // The heights of face the waves said stand for, in metres: from the least of the smallest to
  // the most of the biggest, which is null for the biggest size of all. Null while either size
  // is not said.
  waveFaceMeters: z.object({ least: z.number(), most: z.number().nullable() }).nullable(),
  answeredAt: z.date().nullable(),
  putOffAt: z.date().nullable(),
});

type Row = typeof surferProfile.$inferSelect;

function describe(row: Row): z.infer<typeof profileSchema> {
  const { smallestWave, biggestWave } = row;
  return {
    level: row.level,
    smallestWave,
    biggestWave,
    reading: row.reading,
    boards: row.boards,
    waveFaceMeters:
      smallestWave && biggestWave
        ? { least: SURF_FACES[smallestWave].least, most: SURF_FACES[biggestWave].most }
        : null,
    answeredAt: row.answeredAt,
    putOffAt: row.putOffAt,
  };
}

export const profileRouter = {
  get: protectedProcedure
    .meta({
      mcp: {
        name: "get_my_surfer_profile",
        title: "What the account said of itself as a surfer",
        account: true,
        description:
          "What the person you act for said of themselves as a surfer: their `level`, from " +
          "`beginner` to `pro`, in the words the catalogue gives a break's levels in, the " +
          "waves they surf, `smallestWave` to `biggestWave`, said against a surfer standing " +
          "beside them as their sessions' sizes are, with `waveFaceMeters`, the heights of " +
          "face those stand for, which are not the heights of a forecast, how well they read " +
          "a forecast, `reading`: `glance`, whether it is good, `basics`, the swell, its " +
          "period and the wind, or `everything`, and their `boards`. A null was not said, and " +
          "the whole answer is null when nothing was. It is what the person thinks of " +
          "themselves: read their sessions, list_my_sessions, for what they surfed and rated " +
          "well, which says more once there are a few. Read it before you advise them where " +
          "or when to surf, and fit what you say to it: a break whose levels are above theirs, " +
          "or waves bigger than they surf, is said to be so.",
      },
    })
    .route({
      method: "GET",
      path: "/profile",
      summary: "What the caller said of itself as a surfer",
      description:
        "Its level, the waves it surfs from the smallest to the biggest, with the heights of " +
        "face they stand for, how well it reads a forecast, and its boards. Null until the " +
        "caller answers or puts the questions off.",
      tags: ["Profile"],
    })
    .output(profileSchema.nullable())
    .handler(async ({ context }) => {
      const [row] = await context.db
        .select()
        .from(surferProfile)
        .where(eq(surferProfile.userId, context.session.user.id));
      return row ? describe(row) : null;
    }),

  save: protectedProcedure
    .meta({ analytics: "surfer_profile_saved" })
    .route({
      method: "PUT",
      path: "/profile",
      summary: "Say what the caller is as a surfer",
      description:
        "Every answer at once: what is null is not said, and replaces what was. The biggest " +
        "wave is never smaller than the smallest.",
      tags: ["Profile"],
    })
    .input(answersSchema)
    .output(profileSchema)
    .handler(async ({ input, context }) => {
      if (
        input.smallestWave &&
        input.biggestWave &&
        sizeRank(input.biggestWave) < sizeRank(input.smallestWave)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The biggest wave is smaller than the smallest.",
        });
      }
      // A board said twice is said once.
      const answers = { ...input, boards: input.boards && [...new Set(input.boards)] };
      const answeredAt = new Date();
      const [row] = await context.db
        .insert(surferProfile)
        .values({ userId: context.session.user.id, ...answers, answeredAt })
        .onConflictDoUpdate({ target: surferProfile.userId, set: { ...answers, answeredAt } })
        .returning();
      return describe(row!);
    }),

  putOff: protectedProcedure
    .meta({ analytics: "surfer_profile_put_off" })
    .route({
      method: "POST",
      path: "/profile/put-off",
      summary: "Put the questions off",
      description:
        "The apps no longer ask the caller what it is as a surfer, and it may still answer. " +
        "What it answered before stays.",
      tags: ["Profile"],
    })
    .output(profileSchema)
    .handler(async ({ context }) => {
      const putOffAt = new Date();
      const [row] = await context.db
        .insert(surferProfile)
        .values({ userId: context.session.user.id, putOffAt })
        .onConflictDoUpdate({ target: surferProfile.userId, set: { putOffAt } })
        .returning();
      return describe(row!);
    }),
};
