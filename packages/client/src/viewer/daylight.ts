import { type SunTimes, sunTimes } from "@repo/conditions/sun";

// When it gets light and dark at a place, as a place's panel says it: first light, sunrise,
// sunset and last light, for the reader's today, or for tomorrow once today's last light is
// gone, since what is left to plan then is tomorrow's first session. Days are the reader's own,
// as the tide's are. The web's `Daylight` and the app for phones' read it here.

/** The sun's moments of the day a panel shows, and whether that day is today or tomorrow. */
export type Daylight = SunTimes & { day: "today" | "tomorrow" };

// A day of the reader's clock, from its midnight to the next one, which a change of the clock
// makes 23 or 25 hours long.
function dayOf(moment: number, after: number) {
  const start = new Date(moment);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + after);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()] as const;
}

export function daylightOf(now: number, place: { latitude: number; longitude: number }): Daylight {
  const at = (after: number) => {
    const [from, to] = dayOf(now, after);
    return sunTimes(from, to, place.latitude, place.longitude);
  };
  const today = at(0);
  // The last moment of the day's light: where the sun never goes six degrees under, its setting.
  const ends = today.lastLight ?? today.sunset;
  if (ends && ends.getTime() <= now) return { ...at(1), day: "tomorrow" };
  return { ...today, day: "today" };
}
