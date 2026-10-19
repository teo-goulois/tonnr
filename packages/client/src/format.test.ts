import { describe, expect, it } from "vitest";

import { STALE_MS, formatting, freshnessOf, toKnots } from "./format";
import { ENGLISH } from "./testing";

const HOUR_MS = 60 * 60 * 1000;

describe("what is written in the reader's language", () => {
  it("is written in the language in force when it is written", () => {
    let locale = "en";
    const { formatNumber } = formatting({ locale: () => locale, m: ENGLISH });

    expect(formatNumber(1234.56)).toBe("1,234.6");
    locale = "fr";
    // French puts a narrow space between the thousands.
    expect(formatNumber(1234.56)).toMatch(/^1\s234,6$/);
  });

  it("names the compass point a bearing is nearest to", () => {
    const { compassName, compassPoint } = formatting({ locale: () => "en", m: ENGLISH });

    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(292)).toBe("WNW");
    expect(compassPoint(-10)).toBe("N");
    expect(compassName(350)).toBe("north");
  });

  it("writes how long something lasted", () => {
    const { formatDuration } = formatting({ locale: () => "en", m: ENGLISH });

    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(65)).toBe("1 h 05");
  });
});

describe("a reading", () => {
  it("is turned into knots, and stays unknown when it was not measured", () => {
    expect(toKnots(10)).toBeCloseTo(19.43844, 5);
    expect(toKnots(null)).toBeNull();
  });

  it("can be trusted less as it ages, and not at all past six hours", () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const ago = (hours: number) => new Date(now - hours * HOUR_MS);

    expect(freshnessOf(ago(1), now)).toBe("fresh");
    expect(freshnessOf(ago(2), now)).toBe("aging");
    expect(freshnessOf(ago(4), now)).toBe("old");
    expect(freshnessOf(new Date(now - STALE_MS), now)).toBe("none");
    expect(freshnessOf(null, now)).toBe("none");
  });
});
