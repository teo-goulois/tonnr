// The words the catalogue says a tide and a direction with, for everything that reads or writes
// them: the schema, the API, the worker, the rules of decision 059 and the web app, which judges
// an hour as the page does without a module of the database. Decisions 050 and 061.

/** The stages of the tide, from low water to high water. */
export const TIDE_STAGES = ["low", "mid_low", "mid", "mid_high", "high"] as const;
export type TideStage = (typeof TIDE_STAGES)[number];

/** The sixteen points of the compass, clockwise from north. */
export const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];
