import { describe, expect, it, vi } from "vitest";

import {
  chunksOf,
  createSeaNowLoader,
  hourNowOf,
  inputOf,
  type PlaceRef,
  type PlacesNow,
  type PlacesNowInput,
  type SeaNow,
  seaFiguresOf,
} from "./sea-now";

const at = new Date("2026-10-19T10:20:00Z");
const hourAt = (iso: string, height: number | null) => ({
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

const reading = (overrides: Partial<NonNullable<SeaNow["waves"]>["latestReading"]> = {}) => ({
  observedAt: new Date("2026-10-19T09:50:00Z"),
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
  ...overrides,
});

const station = (id: string) => ({
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

const tide = {
  station: { id: "t", name: "Bayonne" } as unknown as NonNullable<SeaNow["tide"]>["station"],
  datum: "MLLW",
  now: { heightMeters: 2.1, trend: "rising" as const },
  extremes: [
    { time: new Date("2026-10-19T08:00:00Z"), type: "low" as const, heightMeters: 0.9 },
    { time: new Date("2026-10-19T14:10:00Z"), type: "high" as const, heightMeters: 3.8 },
  ],
};

function breakSea(overrides: Partial<SeaNow> = {}): SeaNow {
  return {
    place: {
      kind: "break",
      id: "b1",
      name: "La Côte",
      latitude: 43.5,
      longitude: -1.6,
      source: null,
    },
    forecast: {
      hours: [
        hourAt("2026-10-19T09:00:00Z", 1.1),
        hourAt("2026-10-19T10:00:00Z", 1.4),
        hourAt("2026-10-19T11:00:00Z", 1.7),
      ],
      verdict: null,
      fetchedAt: new Date("2026-10-19T09:00:00Z"),
      stale: false,
      source: {} as NonNullable<SeaNow["forecast"]>["source"],
    },
    waves: { ...station("buoy"), latestReading: reading(), distanceKm: 4 },
    wind: null,
    tide,
    ...overrides,
  } as SeaNow;
}

describe("asking the sea at the places of a screen", () => {
  const refs: PlaceRef[] = Array.from({ length: 14 }, (_, index) => ({
    kind: index % 2 === 0 ? "break" : "station",
    id: `p${index}`,
  }));

  it("names each place once, twelve to a call, in the order they were asked", () => {
    const chunks = chunksOf([...refs, refs[0]!, refs[1]!]);

    expect(chunks.map((chunk) => chunk.length)).toEqual([12, 2]);
    expect(chunks.flat().map((ref) => ref.id)).toEqual(refs.map((ref) => ref.id));
  });

  it("asks each kind by its own ids, and leaves out a kind it names none of", () => {
    expect(
      inputOf([
        { kind: "spot", id: "s1" },
        { kind: "break", id: "b1" },
        { kind: "spot", id: "s2" },
      ]),
    ).toEqual({ breakIds: ["b1"], spotIds: ["s1", "s2"] });
  });

  it("sends what the rows of one moment ask in as few calls as twelve allow", async () => {
    vi.useFakeTimers();
    const asked: PlacesNowInput[] = [];
    const ask = (input: PlacesNowInput) => {
      asked.push(input);
      const named = [
        ...(input.breakIds ?? []).map((id) => ({ kind: "break" as const, id })),
        ...(input.stationIds ?? []).map((id) => ({ kind: "station" as const, id })),
      ];
      return Promise.resolve({
        at,
        // The answer leaves out a place that is no more: p2.
        places: named
          .filter((ref) => ref.id !== "p2")
          .map((ref) => ({ ...breakSea(), place: { ...breakSea().place, ...ref } }) as SeaNow),
      } satisfies PlacesNow);
    };
    const load = createSeaNowLoader(ask);

    const told = Promise.all(refs.map(load));
    await vi.runAllTimersAsync();
    const answers = await told;
    vi.useRealTimers();

    expect(asked).toHaveLength(2);
    expect(answers[0]?.sea.place.id).toBe("p0");
    expect(answers[0]?.at).toEqual(at);
    expect(answers[2]).toBeNull();
    expect(answers[13]?.sea.place.id).toBe("p13");
  });

  it("fails the places of a call that failed, and those alone", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const load = createSeaNowLoader((input) => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("429"));
      return Promise.resolve({
        at,
        places: (input.breakIds ?? []).map(
          (id) => ({ ...breakSea(), place: { ...breakSea().place, id } }) as SeaNow,
        ),
      });
    });

    const first = Promise.allSettled(
      Array.from({ length: 13 }, (_, index) => load({ kind: "break", id: `b${index}` })),
    );
    await vi.runAllTimersAsync();
    const settled = await first;
    vi.useRealTimers();

    expect(settled.slice(0, 12).every((one) => one.status === "rejected")).toBe(true);
    expect(settled[12]).toMatchObject({ status: "fulfilled" });
  });
});

describe("what a row says of the sea now", () => {
  it("takes the hour of the forecast under way, and its peak period", () => {
    const figures = seaFiguresOf(breakSea(), at);

    expect(figures).toMatchObject({
      heightMeters: 1.4,
      periodSeconds: 12,
      wavesFromDegrees: 290,
      from: "forecast",
      atShore: "offshore",
    });
    expect(figures.windKnots).toBeCloseTo(9.72, 1);
    expect(figures.nextTide?.type).toBe("high");
  });

  it("takes the first hour when none has begun, and none of an empty forecast", () => {
    const hours = [hourAt("2026-10-19T11:00:00Z", 1.7)];

    expect(hourNowOf(hours, at)?.waveHeightMeters).toBe(1.7);
    expect(hourNowOf([], at)).toBeNull();
  });

  it("says what the nearest buoy measured where no forecast is kept", () => {
    const figures = seaFiguresOf(breakSea({ forecast: null }), at);

    expect(figures).toMatchObject({ heightMeters: 1.6, periodSeconds: 11, from: "measured" });
    expect(figures.observedAt).toEqual(new Date("2026-10-19T09:50:00Z"));
  });

  it("says of a station what it measured itself, and nothing of the forecast", () => {
    const own = { ...station("s1"), kind: "station" as const };
    const sea = breakSea({
      place: own,
      waves: {
        ...station("s1"),
        latestReading: reading({ significantHeightMeters: 2.2 }),
        distanceKm: 0,
      },
    });

    expect(seaFiguresOf(sea, at)).toMatchObject({ heightMeters: 2.2, from: "measured" });
    // A buoy that stopped: its nearest one is another, which the row does not take for its own.
    const stopped = breakSea({ place: own });
    expect(seaFiguresOf(stopped, at)).toMatchObject({ heightMeters: null, from: null });
  });
});
