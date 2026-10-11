export const SHORE_WINDS = [
  "offshore",
  "cross_offshore",
  "cross_shore",
  "cross_onshore",
  "onshore",
] as const;

/** How a wind blows on a shore: off it, along it, onto it, or between two of those. */
export type ShoreWind = (typeof SHORE_WINDS)[number];

/**
 * How a wind blows at a shore, from where the wind comes from and from where it comes when it
 * blows straight off that shore, both clockwise from north. The circle is cut in parts of 45°:
 * a wind within 22.5° of straight off the shore is offshore, the one facing it is onshore, and
 * the one across is cross-shore.
 */
export function shoreWind(windFromDegrees: number, offshoreFromDegrees: number): ShoreWind {
  const turn = Math.abs(((((windFromDegrees - offshoreFromDegrees) % 360) + 540) % 360) - 180);
  if (turn <= 22.5) return "offshore";
  if (turn <= 67.5) return "cross_offshore";
  if (turn <= 112.5) return "cross_shore";
  if (turn <= 157.5) return "cross_onshore";
  return "onshore";
}
