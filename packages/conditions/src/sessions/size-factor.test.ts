import { describe, expect, it } from "vitest";

import { factorFor, periodBandOf, sectorOf, sizeFactor } from "./size-factor";

const session = (
  account: string,
  waveSize: Parameters<typeof sizeFactor>[0][number]["waveSize"],
  height: number | null,
  direction: number | null = 270,
  period: number | null = 12,
) => ({
  account,
  waveSize,
  figures: {
    waveHeightMeters: height,
    waveDirectionDegrees: direction,
    wavePeakPeriodSeconds: period,
  },
});

describe("the sector and the band of a swell", () => {
  it("centres each sector on a point of the compass", () => {
    expect(sectorOf(0)).toBe("N");
    expect(sectorOf(22)).toBe("N");
    expect(sectorOf(23)).toBe("NE");
    expect(sectorOf(270)).toBe("W");
    expect(sectorOf(337)).toBe("NW");
    expect(sectorOf(338)).toBe("N");
    expect(sectorOf(350)).toBe("N");
    expect(sectorOf(-90)).toBe("W");
  });

  it("cuts the periods at 9 and 13 seconds", () => {
    expect(periodBandOf(6)).toBe("short");
    expect(periodBandOf(8.9)).toBe("short");
    expect(periodBandOf(9)).toBe("medium");
    expect(periodBandOf(12.9)).toBe("medium");
    expect(periodBandOf(13)).toBe("long");
  });
});

describe("the factor of a break", () => {
  it("says nothing of fewer than five sessions, and counts them", () => {
    const learned = sizeFactor([
      session("a", "head", 1),
      session("a", "head", 1),
      session("b", "head", 1),
      session("b", "head", 1),
    ]);
    expect(learned).toEqual({ sessions: 4, factor: null, bySwell: [] });
  });

  it("says nothing of one account's eye alone", () => {
    const learned = sizeFactor(Array.from({ length: 6 }, () => session("a", "head", 1)));
    expect(learned.sessions).toBe(6);
    expect(learned.factor).toBeNull();
  });

  it("leaves out a session with no size, or a flat sea", () => {
    const learned = sizeFactor([
      session("a", null, 1),
      session("a", "head", null),
      session("a", "head", 0.1),
      session("a", "head", 1),
      session("b", "head", 1),
    ]);
    expect(learned).toEqual({ sessions: 2, factor: null, bySwell: [] });
  });

  it("is the median of the faces over the model's heights, to the tenth", () => {
    const learned = sizeFactor([
      session("a", "head", 1), // 1.8
      session("a", "chest", 0.6), // 2
      session("b", "waist", 0.5), // 1.8
      session("b", "waist", 0.3), // 3: one wrong day
      session("c", "shoulder", 1.3), // 1.115
    ]);
    expect(learned.sessions).toBe(5);
    expect(learned.factor).toBe(1.8);
  });

  it("takes the middle of an even count", () => {
    const learned = sizeFactor([
      session("a", "head", 1), // 1.8
      session("a", "head", 1), // 1.8
      session("b", "chest", 0.6), // 2
      session("b", "chest", 0.6), // 2
      session("c", "waist", 0.5), // 1.8
      session("c", "chest", 0.6), // 2
    ]);
    expect(learned.factor).toBe(1.9);
  });

  it("gives a swell its own factor once it holds five sessions of two accounts", () => {
    const west = [
      session("a", "head", 0.9, 275, 14),
      session("a", "head", 0.9, 280, 15),
      session("b", "head", 0.9, 265, 13),
      session("b", "overhead", 1.2, 270, 16),
      session("c", "head", 0.9, 290, 14),
    ];
    const south = [
      session("a", "waist", 0.9, 180, 8),
      session("b", "waist", 0.9, 185, 7),
      session("a", "waist", 0.9, 175, 8),
    ];
    const learned = sizeFactor([...west, ...south]);
    expect(learned.sessions).toBe(8);
    expect(learned.factor).toBe(2);
    expect(learned.bySwell).toEqual([{ sector: "W", period: "long", factor: 2, sessions: 5 }]);
  });

  it("gives a swell nothing of its own when its sessions are one account's", () => {
    const learned = sizeFactor([
      ...Array.from({ length: 5 }, () => session("a", "head", 0.9, 270, 14)),
      session("b", "waist", 0.9, 180, 8),
    ]);
    expect(learned.factor).toBe(2);
    expect(learned.bySwell).toEqual([]);
  });

  it("counts a session with no direction for the break, and for no swell", () => {
    const learned = sizeFactor([
      ...Array.from({ length: 4 }, () => session("a", "head", 0.9, 270, 14)),
      session("b", "head", 0.9, null, 14),
      session("b", "head", 0.9, 270, null),
    ]);
    expect(learned.sessions).toBe(6);
    expect(learned.factor).toBe(2);
    expect(learned.bySwell).toEqual([]);
  });
});

describe("the factor of an hour", () => {
  const learned = {
    sessions: 14,
    factor: 1.8,
    bySwell: [{ sector: "W" as const, period: "long" as const, factor: 2, sessions: 6 }],
  };

  it("is the swell's own when the hour's swell has one", () => {
    expect(factorFor(learned, { waveDirectionDegrees: 280, wavePeakPeriodSeconds: 13 })).toEqual({
      factor: 2,
      sessions: 6,
      swell: { sector: "W", period: "long" },
    });
  });

  it("is the break's otherwise, and when the hour says no swell", () => {
    const whole = { factor: 1.8, sessions: 14, swell: null };
    expect(factorFor(learned, { waveDirectionDegrees: 280, wavePeakPeriodSeconds: 8 })).toEqual(
      whole,
    );
    expect(factorFor(learned, { waveDirectionDegrees: null, wavePeakPeriodSeconds: 13 })).toEqual(
      whole,
    );
  });

  it("is none while the break has none", () => {
    expect(
      factorFor(
        { sessions: 3, factor: null, bySwell: [] },
        { waveDirectionDegrees: 280, wavePeakPeriodSeconds: 13 },
      ),
    ).toBeNull();
  });
});
