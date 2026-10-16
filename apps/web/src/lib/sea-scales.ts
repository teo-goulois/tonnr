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
 * The scales of Windguru's tables, which the week's table is read in unless its reader chooses
 * the app's own: those its spot pages give a visitor without an account, as they were on
 * 2026-10-16, each between its stops as Windguru mixes them. Its energy is that of the swell's
 * power, in the same kilojoules. Its rain fades in from transparent: here it fades in from
 * white, which is what its table shows.
 */
export const WINDGURU_SCALES = {
  height: [
    { value: 0, color: "#ffffff" },
    { value: 0.3, color: "#ffffff" },
    { value: 3, color: "#7a83ff" },
    { value: 5, color: "#ad5ac9" },
    { value: 8, color: "#ff5064" },
    { value: 15, color: "#ffc864" },
  ],
  period: [
    { value: 0, color: "#ffffff" },
    { value: 10, color: "#ffffff" },
    { value: 20, color: "#fc5151" },
  ],
  energy: [
    { value: 0, color: "#ffffff" },
    { value: 400, color: "#1cecff" },
    { value: 1200, color: "#477eff" },
    { value: 2000, color: "#d705ee" },
    { value: 4000, color: "#ff0040" },
    { value: 20000, color: "#ff8c00" },
    { value: 40000, color: "#fff419" },
    { value: 60000, color: "#eff29d" },
  ],
  wind: [
    { value: 0, color: "#ffffff" },
    { value: 5, color: "#ffffff" },
    { value: 8.9, color: "#67f7f1" },
    { value: 13.5, color: "#00ff00" },
    { value: 18.8, color: "#fff000" },
    { value: 24.7, color: "#ff322c" },
    { value: 31.7, color: "#ff0ac8" },
    { value: 38, color: "#ff00ff" },
    { value: 45, color: "#9632ff" },
    { value: 60, color: "#3c3cff" },
    { value: 70, color: "#0000ff" },
  ],
  cloud: [
    { value: 0, color: "#ffffff" },
    { value: 100, color: "#787878" },
  ],
  rain: [
    { value: 0, color: "#ffffff" },
    { value: 3, color: "#6e6efa" },
    { value: 10, color: "#7373ff" },
  ],
  air: [
    { value: -25, color: "#50ffdc" },
    { value: -15, color: "#abbeff" },
    { value: 0, color: "#ffffff" },
    { value: 10, color: "#ffff64" },
    { value: 20, color: "#ffaa00" },
    { value: 30, color: "#ff3232" },
    { value: 35, color: "#ff006e" },
    { value: 40, color: "#ff00a0" },
    { value: 50, color: "#ff50dc" },
  ],
} satisfies Record<string, ScaleStop[]>;

/** Windguru's ink: dark on every row, and light on a wind's color that is dark enough. */
export const WINDGURU_INK = "#202020";
export function windguruWindInk(knots: number) {
  const [red, green, blue] = rgbAt(WINDGURU_SCALES.wind, knots);
  // Its own weighing of the three channels.
  const brightness = Math.sqrt(0.241 * red ** 2 + 0.691 * green ** 2 + 0.068 * blue ** 2);
  if (brightness < 95) return "#e6e6e6";
  return brightness < 120 ? "#000000" : WINDGURU_INK;
}

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
