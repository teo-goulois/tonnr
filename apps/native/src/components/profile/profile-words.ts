import { SURF_FACES } from "@repo/conditions/sessions/sizes";
import type { SurferProfile } from "@repo/client/viewer/types";

import { m } from "@/paraglide/messages";

import type { Board, Level, Reading, SurfSize } from "./profiling";

// What the questions and their answers say, in the web's words (`profile-questions.tsx`):
// decision 063. A module that imports nothing of React Native, so that a test reads it.

export const LEVEL_WORDS: Record<Level, { name: () => string; hint: () => string }> = {
  beginner: { name: m.break_level_beginner, hint: m.profile_level_beginner_hint },
  intermediate: { name: m.break_level_intermediate, hint: m.profile_level_intermediate_hint },
  advanced: { name: m.break_level_advanced, hint: m.profile_level_advanced_hint },
  pro: { name: m.break_level_pro, hint: m.profile_level_pro_hint },
};

export const READING_WORDS: Record<Reading, () => string> = {
  glance: m.profile_reading_glance,
  basics: m.profile_reading_basics,
  everything: m.profile_reading_everything,
};

export const BOARD_WORDS: Partial<Record<Board, () => string>> = {
  shortboard: m.break_board_shortboard,
  fish: m.break_board_fish,
  funboard: m.break_board_funboard,
  longboard: m.break_board_longboard,
  gun: m.break_board_gun,
  bodyboard: m.break_board_bodyboard,
  bodysurf: m.break_board_bodysurf,
  foil: m.break_board_foil,
  sup: m.break_board_sup,
};

const SIZE_NAMES: Record<SurfSize, () => string> = {
  ankle: m.surf_size_ankle,
  knee: m.surf_size_knee,
  waist: m.surf_size_waist,
  chest: m.surf_size_chest,
  shoulder: m.surf_size_shoulder,
  head: m.surf_size_head,
  overhead: m.surf_size_overhead,
  double_overhead: m.surf_size_double_overhead,
  triple_overhead: m.surf_size_triple_overhead,
};

export const sizeName = (size: SurfSize) => SIZE_NAMES[size]();

/**
 * The height of face a size stands for, written with the reader's height: "0.6–1 m", or "13 ft+".
 * `height` writes a height in metres, without its unit, and `unit` is the unit's name.
 */
export function sizeFace(
  size: SurfSize,
  height: (meters: number, digits: number) => string,
  unit: string,
) {
  const { least, most } = SURF_FACES[size];
  // A foot is small enough to be said whole.
  const digits = unit === m.unit_ft() ? 0 : 1;
  return most === null
    ? `${height(least, digits)} ${unit}+`
    : `${height(least, digits)}–${height(most, digits)} ${unit}`;
}

/** What the account said, in a few words: "Intermediate · Knee to Head". Null when nothing. */
export function profileWords(profile: SurferProfile | null | undefined) {
  if (!profile) return null;
  const waves =
    profile.smallestWave && profile.biggestWave
      ? m.profile_waves_range({
          from: sizeName(profile.smallestWave),
          to: sizeName(profile.biggestWave),
        })
      : null;
  const said = [profile.level && LEVEL_WORDS[profile.level].name(), waves].filter(Boolean);
  return said.length > 0 ? said.join(" · ") : null;
}
