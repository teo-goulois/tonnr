// Distances on the globe, near enough for places a few kilometres apart.

export type Point = { latitude: number; longitude: number };

const EARTH_METERS = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The distance between two points, along the great circle. */
export function metersBetween(from: Point, to: Point) {
  const a =
    Math.sin(radians(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The box that holds every point within some meters of a point: "west,south,east,north". */
export function boxAround(point: Point, meters: number): [number, number, number, number] {
  const north = Math.min(90, point.latitude + meters / 111_000);
  const south = Math.max(-90, point.latitude - meters / 111_000);
  // A degree of longitude narrows towards the poles, where the box takes the whole circle.
  const narrowing = Math.cos(radians(Math.min(89, Math.abs(point.latitude) + meters / 111_000)));
  const wide = Math.min(180, meters / (111_000 * narrowing));
  const wrap = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wide >= 180
    ? [-180, south, 180, north]
    : [wrap(point.longitude - wide), south, wrap(point.longitude + wide), north];
}
