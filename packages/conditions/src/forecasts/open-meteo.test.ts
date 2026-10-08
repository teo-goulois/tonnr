import { describe, expect, it } from "vitest";

import { buildForecast, ForecastFormatError } from "./open-meteo";

// 2026-10-08 00:00 and 01:00 UTC.
const times = [1791417600, 1791421200];

function marine(waveHeight: (number | null)[]) {
  return {
    latitude: 43.625,
    longitude: -1.4583282,
    hourly: {
      time: times,
      wave_height: waveHeight,
      wave_period: [7.25, 7.45],
      wave_direction: [311, 312],
      swell_wave_height: [1.96, 2.16],
      swell_wave_period: [6.9, 6.95],
      swell_wave_direction: [301, 305],
      wind_wave_height: [1.2, 1.1],
      wind_wave_period: [4.2, 4.1],
      wind_wave_direction: [325, 327],
    },
  };
}

const weather = {
  hourly: {
    // The weather answer covers only the second hour.
    time: [times[1]],
    wind_speed_10m: [14.73],
    wind_gusts_10m: [16.0],
    wind_direction_10m: [312],
  },
};

describe("buildForecast", () => {
  it("joins waves and wind hour by hour, on the marine model's grid point", () => {
    const forecast = buildForecast(marine([2.34, 2.48]), weather);
    if (forecast === null || forecast instanceof ForecastFormatError)
      throw new Error("no forecast");

    expect(forecast.point).toEqual({ latitude: 43.625, longitude: -1.4583282 });
    expect(forecast.hours).toHaveLength(2);
    expect(forecast.hours[1]).toEqual({
      time: new Date("2026-10-08T01:00:00Z"),
      waveHeightMeters: 2.48,
      wavePeriodSeconds: 7.45,
      waveDirectionDegrees: 312,
      swellHeightMeters: 2.16,
      swellPeriodSeconds: 6.95,
      swellDirectionDegrees: 305,
      windWaveHeightMeters: 1.1,
      windWavePeriodSeconds: 4.1,
      windWaveDirectionDegrees: 327,
      windSpeedMetersPerSecond: 14.73,
      windGustMetersPerSecond: 16,
      windDirectionDegrees: 312,
    });
  });

  it("leaves the wind empty for an hour the weather answer does not cover", () => {
    const forecast = buildForecast(marine([2.34, 2.48]), weather);
    if (forecast === null || forecast instanceof ForecastFormatError)
      throw new Error("no forecast");

    expect(forecast.hours[0]).toMatchObject({
      waveHeightMeters: 2.34,
      windSpeedMetersPerSecond: null,
      windDirectionDegrees: null,
    });
  });

  it("returns null for a point with no sea nearby", () => {
    expect(buildForecast(marine([null, null]), weather)).toBeNull();
  });

  it("reports series that do not have one value per hour", () => {
    const short = marine([2.34, 2.48]);
    short.hourly.wave_period = [];

    expect(buildForecast(short, weather)).toBeInstanceOf(ForecastFormatError);
    expect(buildForecast(marine([]), weather)).toBeInstanceOf(ForecastFormatError);
  });

  it("reports a time that is not a real moment", () => {
    const broken = marine([2.34, 2.48]);
    broken.hourly.time = [1e300, times[1] ?? 0];

    expect(buildForecast(broken, weather)).toBeInstanceOf(ForecastFormatError);
  });

  it("reports an answer that changed shape", () => {
    const changed = { latitude: 43.6, longitude: -1.4, hourly: { time: times } };

    expect(buildForecast(changed, weather)).toBeInstanceOf(ForecastFormatError);
  });
});
