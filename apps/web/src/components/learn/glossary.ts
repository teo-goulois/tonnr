import { APP_NAME } from "@repo/config/app";

import type { Term } from "@/lib/learn";
import { m } from "@/paraglide/messages.js";

// What the glossary says of each word: the word as the app writes it, what it means, and where
// the thing comes from. Every string is a message; an entry that names the product takes its
// name. Decision 060.

export type Entry = { word: () => string; what: () => string; from: () => string };

const name = { name: APP_NAME };

export const GLOSSARY: Record<Term, Entry> = {
  swell: { word: m.learn_g_swell_word, what: m.learn_g_swell_what, from: m.learn_g_swell_from },
  "wind-sea": {
    word: m.learn_g_wind_sea_word,
    what: m.learn_g_wind_sea_what,
    from: m.learn_g_wind_sea_from,
  },
  period: {
    word: m.learn_g_period_word,
    what: m.learn_g_period_what,
    from: m.learn_g_period_from,
  },
  set: { word: m.learn_g_set_word, what: m.learn_g_set_what, from: m.learn_g_set_from },
  chop: { word: m.learn_g_chop_word, what: m.learn_g_chop_what, from: m.learn_g_chop_from },
  buoy: {
    word: m.learn_g_buoy_word,
    what: m.learn_g_buoy_what,
    from: () => m.learn_g_buoy_from(name),
  },
  model: { word: m.learn_g_model_word, what: m.learn_g_model_what, from: m.learn_g_model_from },
  window: {
    word: m.learn_g_window_word,
    what: m.learn_g_window_what,
    from: m.learn_g_window_from,
  },
  sector: {
    word: m.learn_g_sector_word,
    what: () => m.learn_g_sector_what(name),
    from: m.learn_g_sector_from,
  },
  offshore: {
    word: m.learn_g_offshore_word,
    what: m.learn_g_offshore_what,
    from: m.learn_g_offshore_from,
  },
  onshore: {
    word: m.learn_g_onshore_word,
    what: m.learn_g_onshore_what,
    from: m.learn_g_onshore_from,
  },
  "side-shore": {
    word: m.learn_g_side_shore_word,
    what: () => m.learn_g_side_shore_what(name),
    from: m.learn_g_side_shore_from,
  },
  knot: {
    word: m.learn_g_knot_word,
    what: m.learn_g_knot_what,
    from: () => m.learn_g_knot_from(name),
  },
  tide: { word: m.learn_g_tide_word, what: m.learn_g_tide_what, from: m.learn_g_tide_from },
  "high-water": {
    word: m.learn_g_high_water_word,
    what: m.learn_g_high_water_what,
    from: m.learn_g_high_water_from,
  },
  "low-water": {
    word: m.learn_g_low_water_word,
    what: m.learn_g_low_water_what,
    from: m.learn_g_low_water_from,
  },
  "mid-tide": {
    word: m.learn_g_mid_tide_word,
    what: m.learn_g_mid_tide_what,
    from: m.learn_g_mid_tide_from,
  },
  rising: {
    word: m.learn_g_rising_word,
    what: m.learn_g_rising_what,
    from: m.learn_g_rising_from,
  },
  falling: {
    word: m.learn_g_falling_word,
    what: m.learn_g_falling_what,
    from: m.learn_g_falling_from,
  },
  "spring-tides": {
    word: m.learn_g_spring_tides_word,
    what: m.learn_g_spring_tides_what,
    from: m.learn_g_spring_tides_from,
  },
  reef: { word: m.learn_g_reef_word, what: m.learn_g_reef_what, from: m.learn_g_reef_from },
  "beach-break": {
    word: m.learn_g_beach_break_word,
    what: m.learn_g_beach_break_what,
    from: m.learn_g_beach_break_from,
  },
  "point-break": {
    word: m.learn_g_point_break_word,
    what: m.learn_g_point_break_what,
    from: m.learn_g_point_break_from,
  },
  "take-off": {
    word: m.learn_g_take_off_word,
    what: m.learn_g_take_off_what,
    from: m.learn_g_take_off_from,
  },
  fetch: { word: m.learn_g_fetch_word, what: m.learn_g_fetch_what, from: m.learn_g_fetch_from },
  energy: {
    word: m.learn_g_energy_word,
    what: m.learn_g_energy_what,
    from: m.learn_g_energy_from,
  },
  resolution: {
    word: m.learn_g_resolution_word,
    what: () => m.learn_g_resolution_what(name),
    from: m.learn_g_resolution_from,
  },
  run: {
    word: m.learn_g_run_word,
    what: m.learn_g_run_what,
    from: () => m.learn_g_run_from(name),
  },
  "secondary-swell": {
    word: m.learn_g_secondary_swell_word,
    what: m.learn_g_secondary_swell_what,
    from: m.learn_g_secondary_swell_from,
  },
  shadowing: {
    word: m.learn_g_shadowing_word,
    what: m.learn_g_shadowing_what,
    from: m.learn_g_shadowing_from,
  },
  refraction: {
    word: m.learn_g_refraction_word,
    what: m.learn_g_refraction_what,
    from: m.learn_g_refraction_from,
  },
  exposure: {
    word: m.learn_g_exposure_word,
    what: m.learn_g_exposure_what,
    from: m.learn_g_exposure_from,
  },
  "significant-height": {
    word: m.learn_g_significant_height_word,
    what: m.learn_g_significant_height_what,
    from: m.learn_g_significant_height_from,
  },
  lineup: {
    word: m.learn_g_lineup_word,
    what: m.learn_g_lineup_what,
    from: m.learn_g_lineup_from,
  },
};
