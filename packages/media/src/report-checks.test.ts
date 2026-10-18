import { describe, expect, it } from "vitest";

import {
  checkPosition,
  checkTime,
  judgeAnalysis,
  judgeMedium,
  judgeReport,
  readLocalTime,
} from "./report-checks";

// A break of the Basque coast, and points around it.
const BREAK = { latitude: 43.4832, longitude: -1.5586 };
const BEACH = { latitude: 43.4851, longitude: -1.5571 }; // 240 m
const TOWN = { latitude: 43.4929, longitude: -1.4748 }; // about 6.8 km
const SENT = new Date("2026-10-18T10:00:00Z");

describe("where a medium of a report was taken", () => {
  it("takes the file's place first, and keeps it when it is near the break", () => {
    const checked = checkPosition(BEACH, { ...TOWN, accuracyM: 10 }, BREAK);
    expect(checked).toEqual({
      source: "file",
      distanceKm: 0.2,
      accuracyM: null,
      point: BEACH,
      reason: null,
    });
  });

  it("takes the phone's place when the file says none, if it is precise enough", () => {
    expect(checkPosition(null, { ...BEACH, accuracyM: 35 }, BREAK)).toMatchObject({
      source: "device",
      reason: null,
      accuracyM: 35,
    });
    expect(checkPosition(null, { ...BEACH, accuracyM: 2500 }, BREAK).reason).toBe("imprecise");
    expect(checkPosition(null, { ...BEACH, accuracyM: null }, BREAK).reason).toBe("imprecise");
  });

  it("refuses one taken far away, and keeps nothing of where it was but the kilometres", () => {
    expect(checkPosition(TOWN, null, BREAK)).toEqual({
      source: "file",
      distanceKm: 7,
      accuracyM: null,
      point: null,
      reason: "too_far",
    });
  });

  it("refuses one nothing placed", () => {
    expect(checkPosition(null, null, BREAK).reason).toBe("no_position");
  });
});

describe("when a medium of a report was taken", () => {
  const sent = { at: SENT, offsetMinutes: -120, positionSource: "file" as const };

  it("reads a camera's time alone at the browser's offset", () => {
    expect(readLocalTime("2026:10:18 11:30:00", -120)).toEqual(new Date("2026-10-18T09:30:00Z"));
    expect(readLocalTime("not a time", 0)).toBeNull();
  });

  it("takes a photo of the last two hours, and a clock a little ahead", () => {
    expect(checkTime({ source: "gps", at: new Date("2026-10-18T09:30:00Z") }, sent)).toMatchObject({
      ageMinutes: 30,
      reason: null,
    });
    expect(checkTime({ source: "local", local: "2026:10:18 12:10:00" }, sent)).toMatchObject({
      ageMinutes: -10,
      reason: null,
    });
  });

  it("refuses an older one, and one whose clock says it comes from later", () => {
    expect(checkTime({ source: "offset", at: new Date("2026-10-18T07:30:00Z") }, sent).reason).toBe(
      "too_old",
    );
    expect(checkTime({ source: "video", at: new Date("2026-10-18T10:30:00Z") }, sent).reason).toBe(
      "ahead",
    );
  });

  it("takes the time it was sent for a file the phone's browser stripped, and no other", () => {
    expect(checkTime(null, { ...sent, positionSource: "device" })).toEqual({
      source: "sent",
      takenAt: SENT.toISOString(),
      ageMinutes: 0,
      reason: null,
    });
    expect(checkTime(null, sent).reason).toBe("no_time");
    // A camera's time alone, with no browser's offset to read it at, says nothing.
    expect(
      checkTime({ source: "local", local: "2026:10:18 11:30:00" }, { ...sent, offsetMinutes: null })
        .reason,
    ).toBe("no_time");
  });
});

describe("what the analysis decides", () => {
  const seen = { frames: 1, top: [] };
  it("shows the sea, refuses what is not, and leaves the rest to an operator", () => {
    expect(judgeAnalysis({ ...seen, sea: 0.92, nudity: 0.01 }).verdict).toBe("passed");
    expect(judgeAnalysis({ ...seen, sea: 0.1, nudity: 0.01 })).toEqual({
      verdict: "refused",
      reason: "not_sea",
    });
    expect(judgeAnalysis({ ...seen, sea: 0.45, nudity: 0.01 }).verdict).toBe("review");
    expect(judgeAnalysis({ ...seen, sea: 0.95, nudity: 0.9 }).reason).toBe("nudity");
    expect(judgeAnalysis({ ...seen, sea: 0.95, nudity: 0.6 }).verdict).toBe("review");
  });
});

describe("what a report comes to", () => {
  const near = checkPosition(BEACH, null, BREAK);
  const lately = checkTime(
    { source: "gps", at: new Date("2026-10-18T09:40:00Z") },
    {
      at: SENT,
      offsetMinutes: 0,
      positionSource: "file",
    },
  );
  const sea = { sea: 0.9, nudity: 0, frames: 1, top: [] };

  it("checks the place and the time before the sea", () => {
    const far = checkPosition(TOWN, null, BREAK);
    expect(judgeMedium(far, lately, sea)).toMatchObject({
      verdict: "refused",
      reasons: ["too_far"],
    });
    expect(judgeMedium(near, lately, sea)).toMatchObject({ verdict: "passed", reasons: [] });
    expect(judgeMedium(near, lately, null)).toMatchObject({
      verdict: "review",
      reasons: ["unsure"],
    });
  });

  it("is shown when each one passed, left to an operator when one is unsure, refused otherwise", () => {
    const passed = { verdict: "passed" as const };
    expect(judgeReport([passed, passed])).toBe("published");
    expect(judgeReport([passed, { verdict: "review" }])).toBe("review");
    expect(judgeReport([{ verdict: "review" }, { verdict: "refused" }])).toBe("refused");
    expect(judgeReport([passed, null])).toBe("refused");
    expect(judgeReport([])).toBe("refused");
  });
});
