import { ORPCError } from "@orpc/server";
import type { Database } from "@repo/db";
import { station } from "@repo/db/schema/buoys";
import {
  DENSITIES,
  DISTANCE_UNITS,
  HEIGHT_UNITS,
  PRECIPITATION_UNITS,
  RECENT_KINDS,
  type RecentKind,
  TEMPERATURE_UNITS,
  WIND_SPEED_UNITS,
  displayPreferences,
  recentView,
  savedShortcuts,
  unitPreferences,
} from "@repo/db/schema/preferences";
import { spot, surfBreak } from "@repo/db/schema/spots";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

// By action, the hotkey that replaces its default. The web app owns the list of actions.
const overridesSchema = z
  .record(z.string().min(1).max(64), z.string().max(64))
  .refine((overrides) => Object.keys(overrides).length <= 100, "Too many shortcuts");

const savedShortcutsSchema = z.object({ overrides: overridesSchema, savedAt: z.date() });

// The units the caller reads measurements in. The API's own answers stay in SI units: only what
// an app writes on a screen follows these. Decision 033.
const unitsSchema = z.object({
  windSpeed: z.enum(WIND_SPEED_UNITS),
  height: z.enum(HEIGHT_UNITS),
  temperature: z.enum(TEMPERATURE_UNITS),
  distance: z.enum(DISTANCE_UNITS),
  precipitation: z.enum(PRECIPITATION_UNITS),
});
// What an account that has chosen nothing reads in, and what a unit it has not chosen yet is.
const STARTING_UNITS: z.infer<typeof unitsSchema> = {
  windSpeed: "kn",
  height: "m",
  temperature: "c",
  distance: "km",
  precipitation: "mm",
};
const unitColumns = {
  windSpeed: unitPreferences.windSpeed,
  height: unitPreferences.height,
  temperature: unitPreferences.temperature,
  distance: unitPreferences.distance,
  precipitation: unitPreferences.precipitation,
};

// How the caller asks the apps to draw: how much of the forecast a panel shows. Decision 061.
const displaySchema = z.object({ density: z.enum(DENSITIES) });
// What an account that has chosen nothing reads: everything, as Téo chose on 2026-10-16.
const STARTING_DISPLAY: z.infer<typeof displaySchema> = { density: "everything" };
const displayColumns = { density: displayPreferences.density };

// What the caller looked at last: a station, a surf break or a spot of its own, with what a list
// writes of it and where the map finds it. Decision 042.
const recentSchema = z.object({
  kind: z.enum(RECENT_KINDS),
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  viewedAt: z.date(),
});
// How many an account keeps: the oldest leaves when another comes.
const RECENTS_MOST = 5;

// What a row names, by its kind. A spot is one of the account's own: a row never answers
// another's.
const viewedStation = and(eq(recentView.kind, "station"), eq(station.id, recentView.targetId));
const viewedBreak = and(eq(recentView.kind, "break"), eq(surfBreak.id, recentView.targetId));
const viewedSpot = and(
  eq(recentView.kind, "spot"),
  eq(spot.id, recentView.targetId),
  eq(spot.userId, recentView.userId),
);

// The account's recent views, the last first. One whose station, break or spot is gone is left
// out.
function recentsOf(db: Database, userId: string) {
  return db
    .select({
      kind: recentView.kind,
      id: recentView.targetId,
      name: sql<string>`coalesce(${station.name}, ${surfBreak.name}, ${spot.name})`,
      latitude: sql<number>`coalesce(${station.latitude}, ${surfBreak.latitude}, ${spot.latitude})`,
      longitude: sql<number>`coalesce(${station.longitude}, ${surfBreak.longitude}, ${spot.longitude})`,
      viewedAt: recentView.viewedAt,
    })
    .from(recentView)
    .leftJoin(station, viewedStation)
    .leftJoin(surfBreak, viewedBreak)
    .leftJoin(spot, viewedSpot)
    .where(
      and(
        eq(recentView.userId, userId),
        sql`coalesce(${station.id}, ${surfBreak.id}, ${spot.id}) is not null`,
      ),
    )
    .orderBy(desc(recentView.viewedAt))
    .limit(RECENTS_MOST);
}

// Whether there is such a thing for the account to have looked at.
async function isThere(db: Database, userId: string, kind: RecentKind, id: string) {
  const [found] =
    kind === "station"
      ? await db.select({ id: station.id }).from(station).where(eq(station.id, id))
      : kind === "break"
        ? await db.select({ id: surfBreak.id }).from(surfBreak).where(eq(surfBreak.id, id))
        : await db
            .select({ id: spot.id })
            .from(spot)
            .where(and(eq(spot.id, id), eq(spot.userId, userId)));
  return found !== undefined;
}

// What the web app alone keeps in the caller's account: the keyboard's shortcuts, which a phone
// has no use for. It is not part of the public API, and stays outside any version: decision 069.
export const shortcutsRouter = {
  getShortcuts: protectedProcedure
    // Null until the caller saves shortcuts for the first time.
    .output(savedShortcutsSchema.nullable())
    .handler(async ({ context }) => {
      const [saved] = await context.db
        .select({ overrides: savedShortcuts.overrides, savedAt: savedShortcuts.savedAt })
        .from(savedShortcuts)
        .where(eq(savedShortcuts.userId, context.session.user.id));
      return saved ?? null;
    }),

  saveShortcuts: protectedProcedure
    .meta({ analytics: "shortcuts_updated" })
    .input(z.object({ overrides: overridesSchema }))
    .output(savedShortcutsSchema)
    .handler(async ({ input, context }) => {
      const savedAt = new Date();
      const [saved] = await context.db
        .insert(savedShortcuts)
        .values({ userId: context.session.user.id, overrides: input.overrides, savedAt })
        .onConflictDoUpdate({
          target: savedShortcuts.userId,
          set: { overrides: input.overrides, savedAt },
        })
        .returning({ overrides: savedShortcuts.overrides, savedAt: savedShortcuts.savedAt });
      return saved!;
    }),
};

const PREFERENCES = ["Preferences"];

// What the caller chose of how the apps write and draw, and what it looked at last, which every
// app of the instance reads, the web app and the app for phones alike. It belongs to version 1,
// since an app that is installed keeps calling it for months: decision 069.
export const preferencesRouter = {
  getUnits: protectedProcedure
    .route({
      method: "GET",
      path: "/preferences/units",
      summary: "The units the caller reads measurements in",
      description:
        "A wind speed, a height, a temperature, a distance and a rain. Null until the caller " +
        "chooses: an app then reads in knots, metres, Celsius, kilometres and millimetres. The " +
        "API's own answers stay in SI units: only what an app writes on a screen follows " +
        "these. Decision 033.",
      tags: PREFERENCES,
    })
    // Null until the caller chooses units: an app then reads in the units it starts with.
    .output(unitsSchema.nullable())
    .handler(async ({ context }) => {
      const [saved] = await context.db
        .select(unitColumns)
        .from(unitPreferences)
        .where(eq(unitPreferences.userId, context.session.user.id));
      return saved ?? null;
    }),

  saveUnits: protectedProcedure
    .meta({ analytics: "units_updated" })
    .route({
      method: "PATCH",
      path: "/preferences/units",
      summary: "Change some of the caller's units",
      description:
        "The units the call names change, and the others stay as they are: an app that knows " +
        "fewer measurements than the API does not undo the choice of another. Answers every " +
        "unit.",
      tags: PREFERENCES,
    })
    // The units the caller changes. The others stay as they are: an app that knows fewer units
    // than the API does not undo the choice of another.
    .input(unitsSchema.partial())
    .output(unitsSchema)
    .handler(async ({ input, context }) => {
      const savedAt = new Date();
      const [saved] = await context.db
        .insert(unitPreferences)
        .values({ userId: context.session.user.id, ...STARTING_UNITS, ...input, savedAt })
        .onConflictDoUpdate({ target: unitPreferences.userId, set: { ...input, savedAt } })
        .returning(unitColumns);
      return saved!;
    }),

  getDisplay: protectedProcedure
    .route({
      method: "GET",
      path: "/preferences/display",
      summary: "How the caller asks the apps to draw",
      description:
        "How much of the forecast a panel shows: `essentials`, `details` or `everything`. Null " +
        "until the caller chooses: an app then shows everything. Decision 061.",
      tags: PREFERENCES,
    })
    // Null until the caller chooses how the apps draw: an app then draws as it starts.
    .output(displaySchema.nullable())
    .handler(async ({ context }) => {
      const [saved] = await context.db
        .select(displayColumns)
        .from(displayPreferences)
        .where(eq(displayPreferences.userId, context.session.user.id));
      return saved ?? null;
    }),

  saveDisplay: protectedProcedure
    .meta({ analytics: "density_updated" })
    .route({
      method: "PATCH",
      path: "/preferences/display",
      summary: "Change how the caller asks the apps to draw",
      description: "What the call names changes, and the rest stays as it is.",
      tags: PREFERENCES,
    })
    // What the caller changes. The rest stays as it is, as the units do.
    .input(displaySchema.partial())
    .output(displaySchema)
    .handler(async ({ input, context }) => {
      const savedAt = new Date();
      const [saved] = await context.db
        .insert(displayPreferences)
        .values({ userId: context.session.user.id, ...STARTING_DISPLAY, ...input, savedAt })
        .onConflictDoUpdate({ target: displayPreferences.userId, set: { ...input, savedAt } })
        .returning(displayColumns);
      return saved!;
    }),

  getRecents: protectedProcedure
    .route({
      method: "GET",
      path: "/preferences/recents",
      summary: "What the caller looked at last",
      description:
        `A station, a surf break or a spot of the caller's own, the last first, ${RECENTS_MOST} ` +
        "at most, with its name and its place. One that is gone is left out. Decision 042.",
      tags: PREFERENCES,
    })
    .output(z.array(recentSchema))
    .handler(({ context }) => recentsOf(context.db, context.session.user.id)),

  saveRecent: protectedProcedure
    .route({
      method: "POST",
      path: "/preferences/recents",
      summary: "Say that the caller opened a station, a break or a spot",
      description:
        "It comes first, and what was looked at before it follows: the oldest leaves when " +
        `there are more than ${RECENTS_MOST}. Answers the list. A station or a break the ` +
        "instance does not have, or a spot that is not the caller's, is refused with 404.",
      tags: PREFERENCES,
    })
    // The caller opened this. It comes first, and what was looked at before it follows.
    .input(z.object({ kind: z.enum(RECENT_KINDS), id: z.string().min(1).max(200) }))
    .output(z.array(recentSchema))
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      if (!(await isThere(context.db, userId, input.kind, input.id))) {
        throw new ORPCError("NOT_FOUND", { message: `No ${input.kind} "${input.id}".` });
      }
      const viewedAt = new Date();
      await context.db.transaction(async (tx) => {
        await tx
          .insert(recentView)
          .values({ userId, kind: input.kind, targetId: input.id, viewedAt })
          .onConflictDoUpdate({
            target: [recentView.userId, recentView.kind, recentView.targetId],
            set: { viewedAt },
          });
        // Only the last ones stay. Two views at once may leave one too many, which the next
        // takes away, and an answer never holds more.
        await tx.delete(recentView).where(
          and(
            eq(recentView.userId, userId),
            sql`(${recentView.kind}, ${recentView.targetId}) not in (
              select kept.kind, kept.target_id from ${recentView} as kept
              where kept.user_id = ${userId}
              order by kept.viewed_at desc
              limit ${RECENTS_MOST}
            )`,
          ),
        );
      });
      return recentsOf(context.db, userId);
    }),

  clearRecents: protectedProcedure
    .meta({ analytics: "recent_places_cleared" })
    .route({
      method: "DELETE",
      path: "/preferences/recents",
      summary: "Forget what the caller looked at last",
      description: "Answers the empty list.",
      tags: PREFERENCES,
    })
    .output(z.array(recentSchema))
    .handler(async ({ context }) => {
      await context.db.delete(recentView).where(eq(recentView.userId, context.session.user.id));
      return [];
    }),
};
