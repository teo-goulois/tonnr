// What a week of forecast comes to, one line a day, for the page of a surf break: decision 057.
// Pure: the hours are given, with the time zone of the place, and no clock or database is read.

/** An hour of a forecast as the API answers it. */
export type ForecastHour = {
  time: Date;
  waveHeightMeters: number | null;
  wavePeriodSeconds: number | null;
  wavePeakPeriodSeconds: number | null;
  waveDirectionDegrees: number | null;
  primarySwellHeightMeters: number | null;
  primarySwellDirectionDegrees: number | null;
  windSpeedMetersPerSecond: number | null;
  windGustMetersPerSecond: number | null;
  windDirectionDegrees: number | null;
  cloudCoverPercent: number | null;
  precipitationMillimeters: number | null;
  airTemperatureCelsius: number | null;
};

/** One day of the week, in the place's own time zone. */
export type ForecastDay = {
  /** The day, as `YYYY-MM-DD` in the place's time zone. */
  day: string;
  /** How many hours of the day the forecast holds, 24 for a whole one. */
  hours: number;
  /** The largest wave of the day, with its period and its direction at that hour. */
  wave: {
    time: Date;
    heightMeters: number;
    peakPeriodSeconds: number | null;
    directionDegrees: number | null;
    primarySwellHeightMeters: number | null;
    primarySwellDirectionDegrees: number | null;
  } | null;
  /** The wind at the hour nearest to noon, as a surfer reads a day's wind. */
  wind: {
    time: Date;
    speedMetersPerSecond: number;
    gustMetersPerSecond: number | null;
    directionDegrees: number | null;
  } | null;
  /** The air at the same hour. */
  airTemperatureCelsius: number | null;
  cloudCoverPercent: number | null;
  /** The rain of the whole day, as far as the forecast holds it. */
  precipitationMillimeters: number | null;
};

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** The day and the hour of a moment in a time zone: `YYYY-MM-DD` and 0 to 23. */
export function localDayOf(time: Date, timeZone: string) {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    dayFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(time);
  const part = (type: string) => parts.find((found) => found.type === type)?.value ?? "";
  return { day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

/**
 * The days of a forecast, from the day `now` falls in at the place, so many at most: each with
 * its largest wave, its wind at noon, and its rain. A day the forecast has no hour of is left
 * out, so a forecast fetched yesterday evening gives fewer days than one of this morning. A
 * time zone the runtime does not know is read as UTC.
 */
export function weekOf(
  hours: readonly ForecastHour[],
  timeZone: string | null,
  now: Date,
  days = 7,
): ForecastDay[] {
  const zone = knownZone(timeZone);
  const today = localDayOf(now, zone).day;
  const byDay = new Map<string, { hour: number; at: ForecastHour }[]>();
  for (const at of hours) {
    const { day, hour } = localDayOf(at.time, zone);
    if (day < today) continue;
    const found = byDay.get(day) ?? [];
    found.push({ hour, at });
    byDay.set(day, found);
  }
  return [...byDay.entries()]
    .sort(([one], [other]) => (one < other ? -1 : 1))
    .slice(0, days)
    .map(([day, found]) => summarize(day, found));
}

function summarize(day: string, found: { hour: number; at: ForecastHour }[]): ForecastDay {
  let biggest: ForecastHour | null = null;
  for (const { at } of found) {
    if (at.waveHeightMeters === null) continue;
    if (biggest === null || at.waveHeightMeters > (biggest.waveHeightMeters ?? -1)) biggest = at;
  }
  // The hour nearest to noon that has a wind.
  let noon: ForecastHour | null = null;
  let away = Infinity;
  for (const { hour, at } of found) {
    if (at.windSpeedMetersPerSecond === null) continue;
    const distance = Math.abs(hour - 12);
    if (distance < away) {
      away = distance;
      noon = at;
    }
  }
  const rain = found.map(({ at }) => at.precipitationMillimeters).filter((value) => value !== null);
  return {
    day,
    hours: found.length,
    wave:
      biggest && biggest.waveHeightMeters !== null
        ? {
            time: biggest.time,
            heightMeters: biggest.waveHeightMeters,
            peakPeriodSeconds: biggest.wavePeakPeriodSeconds ?? biggest.wavePeriodSeconds,
            directionDegrees: biggest.waveDirectionDegrees,
            primarySwellHeightMeters: biggest.primarySwellHeightMeters,
            primarySwellDirectionDegrees: biggest.primarySwellDirectionDegrees,
          }
        : null,
    wind:
      noon && noon.windSpeedMetersPerSecond !== null
        ? {
            time: noon.time,
            speedMetersPerSecond: noon.windSpeedMetersPerSecond,
            gustMetersPerSecond: noon.windGustMetersPerSecond,
            directionDegrees: noon.windDirectionDegrees,
          }
        : null,
    airTemperatureCelsius: noon?.airTemperatureCelsius ?? null,
    cloudCoverPercent: noon?.cloudCoverPercent ?? null,
    precipitationMillimeters:
      rain.length > 0 ? Math.round(rain.reduce((sum, value) => sum + value, 0) * 10) / 10 : null,
  };
}

function knownZone(timeZone: string | null) {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
