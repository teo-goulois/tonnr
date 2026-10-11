import {
  DISTANCE_UNITS,
  HEIGHT_UNITS,
  PRECIPITATION_UNITS,
  TEMPERATURE_UNITS,
  WIND_SPEED_UNITS,
  savedShortcuts,
  unitPreferences,
} from "@repo/db/schema/preferences";
import { eq } from "drizzle-orm";
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

// What the web app keeps in the caller's account. It is not part of the public API.
export const preferencesRouter = {
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

  getUnits: protectedProcedure
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
};
