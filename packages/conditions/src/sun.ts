const DAY_MS = 24 * 60 * 60 * 1000;
const RADIANS = Math.PI / 180;

/**
 * Whether the sun is under the horizon at a place and a moment, by the low-precision formulas
 * of the Astronomical Almanac: good to a few minutes, which is what a surfer's dawn needs.
 */
export function isNight(time: number, latitude: number, longitude: number) {
  const days = time / DAY_MS + 2440587.5 - 2451545;
  const anomaly = (357.529 + 0.98560028 * days) * RADIANS;
  const ecliptic =
    (280.459 + 0.98564736 * days + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) *
    RADIANS;
  const tilt = (23.439 - 0.00000036 * days) * RADIANS;
  const ascension = Math.atan2(Math.cos(tilt) * Math.sin(ecliptic), Math.cos(ecliptic));
  const declination = Math.asin(Math.sin(tilt) * Math.sin(ecliptic));
  const sidereal = ((18.697374558 + 24.06570982441908 * days) * 15 + longitude) * RADIANS;
  const altitude = Math.asin(
    Math.sin(latitude * RADIANS) * Math.sin(declination) +
      Math.cos(latitude * RADIANS) * Math.cos(declination) * Math.cos(sidereal - ascension),
  );
  return altitude < -0.833 * RADIANS;
}
