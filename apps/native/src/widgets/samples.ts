import type { SavedList } from "@repo/client/viewer/types";

import type { PlacesNow, SeaNow } from "@/components/saved/sea-now";

// Places as `places.now` answers them, for the tests of the widgets: a break whose forecast is
// kept, a buoy, and a spot with nothing near it. Invented, as every test's places are.

export const now = new Date("2026-10-20T10:20:00Z");
export const fetchedAt = new Date("2026-10-20T09:05:00Z");

export const list = (overrides: Partial<SavedList>): SavedList =>
  ({
    id: "list",
    name: "Weekend",
    isDefault: false,
    reportsOn: true,
    stationIds: [],
    breakIds: [],
    spotIds: [],
    share: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as SavedList;

export const hour = (iso: string, height: number | null) => ({
  time: new Date(iso),
  waveHeightMeters: height,
  wavePeriodSeconds: 9,
  wavePeakPeriodSeconds: 12,
  waveDirectionDegrees: 290,
  windSpeedMetersPerSecond: 5,
  windGustMetersPerSecond: 8,
  windDirectionDegrees: 100,
  atShore: "offshore" as const,
});

export const reading = (observedAt: string) => ({
  observedAt: new Date(observedAt),
  significantHeightMeters: 1.6,
  maxHeightMeters: null,
  peakPeriodSeconds: 11,
  meanPeriodSeconds: 8,
  significantPeriodSeconds: null,
  peakDirectionDegrees: 280,
  directionalSpreadDegrees: null,
  waterTemperatureCelsius: null,
  windSpeedMetersPerSecond: 4,
  windGustMetersPerSecond: null,
  windDirectionDegrees: 200,
  validated: true,
});

export const station = (id: string) => ({
  id,
  provider: "candhis",
  name: `Buoy ${id}`,
  latitude: 43.5,
  longitude: -1.6,
  attribution: "Candhis",
  measures: ["waves" as const],
  exposure: null,
  license: { type: "etalab-2.0", url: "https://example.org", commercialUse: true },
});

export const tide = {
  station: { id: "t", name: "Bayonne" } as unknown as NonNullable<SeaNow["tide"]>["station"],
  datum: "MLLW",
  now: { heightMeters: 2.1, trend: "rising" as const },
  extremes: [
    { time: new Date("2026-10-20T08:00:00Z"), type: "low" as const, heightMeters: 0.9 },
    { time: new Date("2026-10-20T14:10:00Z"), type: "high" as const, heightMeters: 3.8 },
  ],
};

/** A break whose kept forecast reaches from 10:00 to 13:00, four hours. */
export function breakSea(id = "b1", name = "La Côte"): SeaNow {
  return {
    place: {
      kind: "break",
      id,
      name,
      latitude: 43.5,
      longitude: -1.6,
      source: { provider: null, url: null, attribution: null, license: null },
    },
    forecast: {
      hours: [
        hour("2026-10-20T10:00:00Z", 1.1),
        hour("2026-10-20T11:00:00Z", 1.4),
        hour("2026-10-20T12:00:00Z", 1.8),
        hour("2026-10-20T13:00:00Z", 2.2),
      ],
      verdict: null,
      fetchedAt,
      stale: false,
      source: {} as NonNullable<SeaNow["forecast"]>["source"],
    },
    waves: null,
    wind: null,
    tide,
  };
}

/** A buoy that measured at 09:50, with no forecast. */
export function buoySea(id = "s1"): SeaNow {
  return {
    place: { ...station(id), kind: "station" },
    forecast: null,
    waves: { ...station(id), latestReading: reading("2026-10-20T09:50:00Z"), distanceKm: 0 },
    wind: null,
    tide: null,
  };
}

/** A spot near which nothing measured, and whose cell nobody asked for today. */
export function silentSpot(id = "p1"): SeaNow {
  return {
    place: { kind: "spot", id, name: "Mine", latitude: 43.4, longitude: -1.5 },
    forecast: null,
    waves: null,
    wind: null,
    tide: null,
  };
}

export const answerOf = (...places: SeaNow[]): PlacesNow => ({ at: now, places });
