const DAY_MS = 24 * 60 * 60 * 1000;
const RADIANS = Math.PI / 180;

// The sun's disc has just gone under a flat horizon, seen through the air.
const SUNSET_DEGREES = -0.833;
// Day, to a surfer, is from first light to last: the sun no more than this far under the
// horizon, which is when civil twilight begins and ends. About half an hour before sunrise and
// after sunset on most coasts.
export const FIRST_LIGHT_DEGREES = -6;

// How far apart the sun is looked at for its crossings: it crosses a height once at most in that
// time, and the crossing is then found to the second.
const STEP_MS = 10 * 60 * 1000;

/**
 * How high the sun is at a place and a moment, in degrees above the horizon, by the
 * low-precision formulas of the Astronomical Almanac: good to a few minutes, which is what a
 * surfer's dawn needs.
 */
export function sunAltitude(time: number, latitude: number, longitude: number) {
  const days = time / DAY_MS + 2440587.5 - 2451545;
  const anomaly = (357.529 + 0.98560028 * days) * RADIANS;
  const ecliptic =
    (280.459 + 0.98564736 * days + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) *
    RADIANS;
  const tilt = (23.439 - 0.00000036 * days) * RADIANS;
  const ascension = Math.atan2(Math.cos(tilt) * Math.sin(ecliptic), Math.cos(ecliptic));
  const declination = Math.asin(Math.sin(tilt) * Math.sin(ecliptic));
  const sidereal = ((18.697374558 + 24.06570982441908 * days) * 15 + longitude) * RADIANS;
  return (
    Math.asin(
      Math.sin(latitude * RADIANS) * Math.sin(declination) +
        Math.cos(latitude * RADIANS) * Math.cos(declination) * Math.cos(sidereal - ascension),
    ) / RADIANS
  );
}

/** Whether the sun is under the horizon at a place and a moment. */
export function isNight(time: number, latitude: number, longitude: number) {
  return sunAltitude(time, latitude, longitude) < SUNSET_DEGREES;
}

/**
 * The moments of a day the sun crosses first light and the horizon, on its way up and on its way
 * down, between two moments, at a place. A crossing that does not happen that day, as near the
 * poles, is null: the sun stays up, or stays under.
 */
export type SunTimes = {
  firstLight: Date | null;
  sunrise: Date | null;
  sunset: Date | null;
  lastLight: Date | null;
};

export function sunTimes(from: number, to: number, latitude: number, longitude: number): SunTimes {
  const crossings = (degrees: number) => {
    let rising: Date | null = null;
    let setting: Date | null = null;
    const above = (moment: number) => sunAltitude(moment, latitude, longitude) >= degrees;
    let before = from;
    let wasAbove = above(before);
    while (before < to) {
      const after = Math.min(before + STEP_MS, to);
      const isAbove = above(after);
      if (isAbove !== wasAbove) {
        let [same, other] = [before, after];
        while (other - same > 1000) {
          const middle = (same + other) / 2;
          if (above(middle) === wasAbove) same = middle;
          else other = middle;
        }
        if (isAbove) rising ??= new Date(Math.round(other));
        else setting ??= new Date(Math.round(other));
      }
      [before, wasAbove] = [after, isAbove];
    }
    return { rising, setting };
  };
  const light = crossings(FIRST_LIGHT_DEGREES);
  const sun = crossings(SUNSET_DEGREES);
  return {
    firstLight: light.rising,
    sunrise: sun.rising,
    sunset: sun.setting,
    lastLight: light.setting,
  };
}
