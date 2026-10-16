// The color scales of the map. The sea, the buoys, the wind stations, the legends and the charts
// all read them from here, so one value has one color everywhere.

export type ScaleStop = { value: number; color: string };

type Rgb = [number, number, number];

/**
 * Significant wave height, in metres. The progression is the one surf forecasts use: blue for a
 * flat sea, green for a surfable one, then yellow, orange, red and purple.
 */
export const WAVE_HEIGHT_SCALE: ScaleStop[] = [
  { value: 0, color: "#3b6fd4" },
  { value: 0.5, color: "#2f8fe0" },
  { value: 1, color: "#1fb5c9" },
  { value: 1.5, color: "#22b573" },
  { value: 2, color: "#8fcc3a" },
  { value: 2.5, color: "#f2d53c" },
  { value: 3, color: "#f6a531" },
  { value: 4, color: "#ee6a2c" },
  { value: 5, color: "#de3440" },
  { value: 6.5, color: "#c2238f" },
  { value: 8, color: "#8b3fd6" },
  { value: 10, color: "#e9d5ff" },
];

/** The tide has no scale: one blue for its curve, and a paler one for the hours already gone. */
export const TIDE_COLOR = "#5f84e6";
export const TIDE_PAST_COLOR = `${TIDE_COLOR}73`;

/** Wind speed, in knots. */
export const WIND_SPEED_SCALE: ScaleStop[] = [
  { value: 0, color: "#a9cdf0" },
  { value: 5, color: "#6fc7e8" },
  { value: 10, color: "#5fcf8a" },
  { value: 15, color: "#c6dd4a" },
  { value: 20, color: "#f5c53a" },
  { value: 25, color: "#f08a2e" },
  { value: 30, color: "#e4492f" },
  { value: 40, color: "#c02b8a" },
  { value: 50, color: "#7d3ac1" },
];

/**
 * Wave period, in seconds. One hue that deepens with the period, so that a table colored by the
 * height and the wind as well stays readable: a short chop is pale, a long swell is saturated.
 */
export const WAVE_PERIOD_SCALE: ScaleStop[] = [
  { value: 4, color: "#c9c5f3" },
  { value: 7, color: "#a99ff1" },
  { value: 10, color: "#8b70ee" },
  { value: 13, color: "#7647ea" },
  { value: 16, color: "#6a2be0" },
  { value: 20, color: "#5b16c9" },
];

/**
 * Wave energy, in kilojoules per metre of crest, as `waveEnergy` counts it. One hue too, from a
 * ripple to a heavy swell: 1 m of 10 s is near 200, 2 m of 14 s near 1,500.
 */
export const WAVE_ENERGY_SCALE: ScaleStop[] = [
  { value: 0, color: "#f6cdd9" },
  { value: 400, color: "#f3a3bb" },
  { value: 1000, color: "#ee769c" },
  { value: 2000, color: "#e64b80" },
  { value: 4000, color: "#d62667" },
  { value: 8000, color: "#b51252" },
  { value: 16000, color: "#8a0c40" },
];

/** Cloud cover, in percent of the sky. One gray that thickens: a clear sky leaves its cell empty. */
export const CLOUD_COVER_SCALE: ScaleStop[] = [
  { value: 0, color: "#a8b0ba" },
  { value: 100, color: "#6b7480" },
];

/** Precipitation, in millimetres an hour. One blue, from a drizzle to a downpour. */
export const PRECIPITATION_SCALE: ScaleStop[] = [
  { value: 0, color: "#9cc3f5" },
  { value: 1, color: "#5f9cf0" },
  { value: 4, color: "#2f6fe0" },
  { value: 10, color: "#1f49b8" },
];

/**
 * The scales of Windguru's tables, for a reader who chose to read the week's table in them: each
 * row from white, on a color of its own. They are read on a capture of its table of 2026-10-16,
 * where the figures met: the wind from 4 to 29 kn, the waves from 0.5 to 3.4 m, the period from
 * 8 to 19 s, the air from 10 to 16 °C, the rain to 1 mm. Above and below, they go on as its hues
 * do, and the energy, which it does not show, takes a hue it leaves free.
 */
export const WINDGURU_SCALES = {
  height: [
    { value: 0, color: "#ffffff" },
    { value: 0.5, color: "#f4f5ff" },
    { value: 1, color: "#e0e2ff" },
    { value: 1.5, color: "#c3c7ff" },
    { value: 2, color: "#aab0ff" },
    { value: 3, color: "#7c84fe" },
    { value: 3.5, color: "#857af4" },
    { value: 4.5, color: "#a05ae8" },
    { value: 6, color: "#c43fd4" },
    { value: 8, color: "#e62a9e" },
    { value: 10, color: "#f0255a" },
  ],
  period: [
    { value: 8, color: "#ffffff" },
    { value: 10, color: "#fff5f5" },
    { value: 11, color: "#ffe8e8" },
    { value: 12, color: "#fedcdc" },
    { value: 13, color: "#fed0d0" },
    { value: 14, color: "#fec0c0" },
    { value: 15, color: "#fea8a8" },
    { value: 16, color: "#fd9494" },
    { value: 17, color: "#fd8a8a" },
    { value: 18, color: "#fd7878" },
    { value: 19, color: "#fc6464" },
    { value: 22, color: "#f03c3c" },
    { value: 25, color: "#d82020" },
  ],
  energy: [
    { value: 0, color: "#ffffff" },
    { value: 400, color: "#fff0c8" },
    { value: 1000, color: "#ffd890" },
    { value: 2000, color: "#ffb860" },
    { value: 4000, color: "#ff8c40" },
    { value: 8000, color: "#f06028" },
    { value: 16000, color: "#d03818" },
  ],
  wind: [
    { value: 4, color: "#ffffff" },
    { value: 5, color: "#e4fefd" },
    { value: 6, color: "#c8fcfa" },
    { value: 7, color: "#a6faf7" },
    { value: 8, color: "#8bf9f4" },
    { value: 9, color: "#6ff7f2" },
    { value: 10, color: "#4bf9b3" },
    { value: 11, color: "#30fb6b" },
    { value: 12, color: "#16fd30" },
    { value: 13, color: "#02ff07" },
    { value: 14, color: "#23fd04" },
    { value: 16, color: "#7cf803" },
    { value: 18, color: "#c9f300" },
    { value: 19, color: "#f4f102" },
    { value: 20, color: "#ffd008" },
    { value: 21, color: "#ffb30f" },
    { value: 22, color: "#ff7d1c" },
    { value: 24, color: "#ff4c26" },
    { value: 26, color: "#ff294d" },
    { value: 28, color: "#ff1e78" },
    { value: 30, color: "#ff13a4" },
    { value: 34, color: "#ff00ff" },
    { value: 40, color: "#c000ff" },
    { value: 50, color: "#8000ff" },
  ],
  cloud: [
    { value: 0, color: "#ffffff" },
    { value: 100, color: "#787878" },
  ],
  rain: [
    { value: 0, color: "#ffffff" },
    { value: 1, color: "#cdcdfe" },
    { value: 3, color: "#9a9aff" },
    { value: 10, color: "#5a5af0" },
  ],
  air: [
    { value: -10, color: "#a0c8ff" },
    { value: 0, color: "#c8f0ff" },
    { value: 5, color: "#e8ffa0" },
    { value: 10, color: "#fffd61" },
    { value: 11, color: "#fff65a" },
    { value: 13, color: "#ffe94a" },
    { value: 14, color: "#ffdc3c" },
    { value: 15, color: "#ffd330" },
    { value: 16, color: "#ffcf2b" },
    { value: 20, color: "#ffa820" },
    { value: 25, color: "#ff7818" },
    { value: 30, color: "#ff4810" },
    { value: 35, color: "#e02008" },
  ],
} satisfies Record<string, ScaleStop[]>;

/** A station without a recent reading. */
export const NO_READING_COLOR = "#8a8a8a";

// A sea under this height keeps the basemap's color, so a flat sea reads as empty.
const SEA_FADE_IN_METERS = 0.5;
const SEA_OPACITY = 0.82;

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(from: Rgb, to: Rgb, ratio: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * ratio),
    Math.round(from[1] + (to[1] - from[1]) * ratio),
    Math.round(from[2] + (to[2] - from[2]) * ratio),
  ];
}

function rgbAt(scale: ScaleStop[], value: number): Rgb {
  const first = scale[0]!;
  const last = scale.at(-1)!;
  if (value <= first.value) return parseHex(first.color);
  if (value >= last.value) return parseHex(last.color);

  const upperIndex = scale.findIndex((stop) => stop.value >= value);
  const lower = scale[upperIndex - 1]!;
  const upper = scale[upperIndex]!;
  return mix(
    parseHex(lower.color),
    parseHex(upper.color),
    (value - lower.value) / (upper.value - lower.value),
  );
}

/** The color of a value on a scale, between its two nearest stops. */
export function scaleColor(scale: ScaleStop[], value: number) {
  const [red, green, blue] = rgbAt(scale, value);
  return `rgb(${red} ${green} ${blue})`;
}

/** Black or white, whichever reads better on the color of this value. */
export function scaleInk(scale: ScaleStop[], value: number) {
  const [red, green, blue] = rgbAt(scale, value);
  // Perceived brightness, as the eye weighs the three channels.
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? "#0b0b0b" : "#ffffff";
}

/**
 * The color of every gray level of a sea tile, as 256 RGBA quadruplets. `metersByLevel` gives the
 * height each level stands for, as the API describes the tiles.
 */
export function seaColorTable(metersByLevel: readonly number[]) {
  const table = new Uint8ClampedArray(256 * 4);
  for (let level = 0; level < 256; level++) {
    const meters = metersByLevel[level] ?? 0;
    const [red, green, blue] = rgbAt(WAVE_HEIGHT_SCALE, meters);
    table[level * 4] = red;
    table[level * 4 + 1] = green;
    table[level * 4 + 2] = blue;
    table[level * 4 + 3] = Math.round(255 * SEA_OPACITY * Math.min(1, meters / SEA_FADE_IN_METERS));
  }
  return table;
}
