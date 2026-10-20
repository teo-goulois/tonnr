import { describe, expect, it } from "vitest";

import { isCounted, reportParts } from "./parts";

const HOUR = 60 * 60 * 1000;

describe("the reports a device counts", () => {
  it("are another's that are shown, and never the reader's own or one that is checked", () => {
    expect(isCounted({ state: "published", mine: false })).toBe(true);
    expect(isCounted({ state: "published", mine: true })).toBe(false);
    expect(isCounted({ state: "checking", mine: false })).toBe(false);
    expect(isCounted({ state: "hidden", mine: false })).toBe(false);
  });
});

describe("the reports of a break", () => {
  const now = new Date(2026, 9, 20, 12, 0).getTime();
  const at = (hoursAgo: number) => ({
    id: `${hoursAgo}h`,
    createdAt: new Date(now - hoursAgo * HOUR),
  });

  it("are the sea of now for six hours, then of the week, each in the order given", () => {
    const parts = reportParts([at(0.5), at(5.9), at(6), at(30), at(140)], now);
    expect(parts.now.map((report) => report.id)).toEqual(["0.5h", "5.9h"]);
    expect(parts.week.map((report) => report.id)).toEqual(["6h", "30h", "140h"]);
  });

  it("are none of either when there is none", () => {
    expect(reportParts([], now)).toEqual({ now: [], week: [] });
  });
});
