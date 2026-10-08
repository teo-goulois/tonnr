import { savedShortcuts } from "@repo/db/schema/preferences";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

// By action, the hotkey that replaces its default. The web app owns the list of actions.
const overridesSchema = z
  .record(z.string().min(1).max(64), z.string().max(64))
  .refine((overrides) => Object.keys(overrides).length <= 100, "Too many shortcuts");

const savedShortcutsSchema = z.object({ overrides: overridesSchema, savedAt: z.date() });

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
};
