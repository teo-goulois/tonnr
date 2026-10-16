import { type LessonOf, type Level } from "@/lib/learn";
import {
  TIDE_COLOR,
  WAVE_ENERGY_SCALE,
  WAVE_HEIGHT_SCALE,
  WAVE_PERIOD_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
} from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

// What every page says of a lesson before it is read: its title, and the color of its tile, taken
// from the scale of the figure it teaches. The hub lists them, and a guide draws them.

export const LEVEL_NAMES: Record<Level, () => string> = {
  beginner: m.learn_level_beginner,
  intermediate: m.learn_level_intermediate,
  advanced: m.learn_level_advanced,
};

export const GUIDE_TITLES: Record<Level, () => string> = {
  beginner: m.learn_beginner_title,
  intermediate: m.learn_intermediate_title,
  advanced: m.learn_advanced_title,
};

export const GUIDE_LEADS: Record<Level, () => string> = {
  beginner: m.learn_beginner_lead,
  intermediate: m.learn_intermediate_lead,
  advanced: m.learn_advanced_lead,
};

const HEIGHT = scaleColor(WAVE_HEIGHT_SCALE, 1.5);
const PERIOD = scaleColor(WAVE_PERIOD_SCALE, 13);
const SWELL = scaleColor(WAVE_HEIGHT_SCALE, 0.5);
const WIND = scaleColor(WIND_SPEED_SCALE, 25);
const ENERGY = scaleColor(WAVE_ENERGY_SCALE, 2000);

type Heads<L extends Level> = Record<LessonOf<L>, { title: () => string; color: string }>;

export const LESSON_HEADS: { [L in Level]: Heads<L> } = {
  beginner: {
    height: { title: m.learn_b_height_title, color: HEIGHT },
    period: { title: m.learn_b_period_title, color: PERIOD },
    swell: { title: m.learn_b_swell_title, color: SWELL },
    wind: { title: m.learn_b_wind_title, color: WIND },
    tide: { title: m.learn_b_tide_title, color: TIDE_COLOR },
  },
  intermediate: {
    "swell-and-wind-sea": { title: m.learn_i_swell_and_wind_sea_title, color: SWELL },
    energy: { title: m.learn_i_energy_title, color: ENERGY },
    fetch: { title: m.learn_i_fetch_title, color: WIND },
    week: { title: m.learn_i_week_title, color: HEIGHT },
    neighbours: { title: m.learn_i_neighbours_title, color: PERIOD },
  },
  advanced: {
    models: { title: m.learn_a_models_title, color: PERIOD },
    buoys: { title: m.learn_a_buoys_title, color: SWELL },
    secondary: { title: m.learn_a_secondary_title, color: ENERGY },
    shadow: { title: m.learn_a_shadow_title, color: HEIGHT },
    alert: { title: m.learn_a_alert_title, color: WIND },
  },
};
