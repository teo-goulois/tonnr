import type { SessionConditions, SessionHour } from "@repo/db/schema/sessions";
import { describe, expect, it } from "vitest";

import { sessionFigures } from "./figures";

const hour = (time: string, values: Partial<SessionHour>): SessionHour => ({
  time,
  waveHeightMeters: null,
  wavePeriodSeconds: null,
  wavePeakPeriodSeconds: null,
  waveDirectionDegrees: null,
  primarySwellHeightMeters: null,
  primarySwellDirectionDegrees: null,
  windSpeedMetersPerSecond: null,
  windGustMetersPerSecond: null,
  windDirectionDegrees: null,
  cloudCoverPercent: null,
  precipitationMillimeters: null,
  airTemperatureCelsius: null,
  ...values,
});

const NOTHING: SessionConditions = {
  model: null,
  modelMissing: "unavailable",
  tide: null,
  buoy: null,
  wind: null,
  offshoreDirectionDegrees: null,
};

const reading = (observedAt: string, values: Record<string, number>) => ({
  observedAt,
  significantHeightMeters: null,
  maxHeightMeters: null,
  peakPeriodSeconds: null,
  meanPeriodSeconds: null,
  peakDirectionDegrees: null,
  waterTemperatureCelsius: null,
  windSpeedMetersPerSecond: null,
  windGustMetersPerSecond: null,
  windDirectionDegrees: null,
  ...values,
});

describe("the figures of a session", () => {
  // From 09:00 to 10:30: its middle is 09:45.
  const started = new Date("2026-10-10T09:00:00Z");

  it("are the models' at the middle of the session, between the two hours around it", () => {
    const figures = sessionFigures(
      {
        ...NOTHING,
        modelMissing: null,
        model: {
          point: { latitude: 47.8, longitude: -4.3 },
          waveModels: ["ecmwf_wam"],
          swellModels: [],
          hours: [
            hour("2026-10-10T09:00:00Z", {
              waveHeightMeters: 1,
              wavePeakPeriodSeconds: 12,
              waveDirectionDegrees: 350,
              windSpeedMetersPerSecond: 4,
              windDirectionDegrees: 80,
            }),
            hour("2026-10-10T10:00:00Z", {
              waveHeightMeters: 2,
              wavePeakPeriodSeconds: 14,
              waveDirectionDegrees: 10,
              windSpeedMetersPerSecond: 8,
              windDirectionDegrees: 100,
            }),
          ],
        },
        offshoreDirectionDegrees: 90,
      },
      started,
      90,
    );

    expect(figures).toMatchObject({
      waveHeightMeters: 1.75,
      wavePeakPeriodSeconds: 13.5,
      // A bearing is the nearer hour's: 350° and 10° do not average to 180°.
      waveDirectionDegrees: 10,
      windSpeedMetersPerSecond: 7,
      windDirectionDegrees: 100,
      shoreWind: "offshore",
      primarySwellHeightMeters: null,
    });
  });

  it("keep a figure null where an hour around the middle has none, and all of them without a model", () => {
    const figures = sessionFigures(
      {
        ...NOTHING,
        model: {
          point: { latitude: 47.8, longitude: -4.3 },
          waveModels: [],
          swellModels: [],
          hours: [
            hour("2026-10-10T09:00:00Z", { waveHeightMeters: 1 }),
            hour("2026-10-10T10:00:00Z", {}),
          ],
        },
      },
      started,
      90,
    );
    expect(figures.waveHeightMeters).toBeNull();
    expect(sessionFigures(null, started, 90)).toMatchObject({
      waveHeightMeters: null,
      shoreWind: null,
      tideHeightMeters: null,
      buoy: null,
    });
  });

  it("say where the tide stood between its low and its high, and which way it went", () => {
    const tide = {
      station: { id: "brest", name: "Brest", distanceKm: 20 },
      datum: "LAT",
      heights: [
        { time: "2026-10-10T09:30:00Z", heightMeters: 2 },
        { time: "2026-10-10T10:00:00Z", heightMeters: 3 },
      ],
      extremes: [
        { time: "2026-10-10T07:00:00Z", type: "low" as const, heightMeters: 1 },
        { time: "2026-10-10T13:00:00Z", type: "high" as const, heightMeters: 5 },
      ],
    };
    expect(sessionFigures({ ...NOTHING, tide }, started, 90)).toMatchObject({
      tideHeightMeters: 2.5,
      tideTrend: "rising",
      tideLevel: 0.38,
    });
    // After the last turn that is known, the tide's way is not.
    const turned = { ...tide, extremes: tide.extremes.slice(0, 1) };
    expect(sessionFigures({ ...NOTHING, tide: turned }, started, 90)).toMatchObject({
      tideTrend: null,
      tideLevel: null,
    });
  });

  it("read the buoy and the wind station nearest the middle, each on what it measured", () => {
    const figures = sessionFigures(
      {
        ...NOTHING,
        buoy: {
          stationId: "b",
          name: "Pierres Noires",
          distanceKm: 31.4,
          attribution: "Test",
          readings: [
            reading("2026-10-10T09:00:00Z", {
              significantHeightMeters: 1.8,
              peakPeriodSeconds: 13,
            }),
            // The nearest reading holds the water alone: the waves are read on the one before.
            reading("2026-10-10T09:40:00Z", { waterTemperatureCelsius: 15.2 }),
          ],
        },
        wind: {
          stationId: "w",
          name: "Penmarc'h",
          distanceKm: 6,
          attribution: "Test",
          readings: [reading("2026-10-10T09:48:00Z", { windSpeedMetersPerSecond: 6 })],
        },
      },
      started,
      90,
    );
    expect(figures.buoy).toEqual({
      name: "Pierres Noires",
      distanceKm: 31.4,
      significantHeightMeters: 1.8,
      periodSeconds: 13,
      directionDegrees: null,
      waterTemperatureCelsius: 15.2,
    });
    expect(figures.measuredWind).toMatchObject({ name: "Penmarc'h", speedMetersPerSecond: 6 });
  });
});
