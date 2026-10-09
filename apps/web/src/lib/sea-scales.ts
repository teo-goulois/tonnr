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
