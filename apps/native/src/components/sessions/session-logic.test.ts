import type { SessionDraft, Upload } from "@repo/client/sessions/types";
import { describe, expect, it } from "vitest";

import {
  dayWords,
  isAskingOf,
  mediaIdsOf,
  nearestPlace,
  placeOfParam,
  placeParam,
  sessionChanges,
  startFault,
  withClock,
  withDay,
} from "./session-logic";

describe("when a session began", () => {
  const now = new Date(2026, 9, 19, 12, 0).getTime();

  it("may be up to a quarter of an hour ahead of now, as the API takes it", () => {
    expect(startFault(new Date(2026, 9, 19, 8, 10), now)).toBeUndefined();
    expect(startFault(new Date(2026, 9, 19, 12, 15), now)).toBeUndefined();
  });

  it("is refused, in the web's words, once it is further ahead", () => {
    expect(startFault(new Date(2026, 9, 19, 12, 20), now)).toBe(
      "A session is written once it has begun.",
    );
  });
});

describe("the photos and the videos a session is saved with", () => {
  const upload = (key: string, state: Upload["state"], id: string | null): Upload => ({
    key,
    name: `${key}.jpg`,
    purpose: "session",
    kind: "photo",
    type: "image/jpeg",
    preview: `file:///${key}.jpg`,
    progress: state === "sending" ? 0.5 : 1,
    state,
    error: null,
    id,
  });
  const uploads = new Map([
    ["a", upload("a", "sending", null)],
    ["b", upload("b", "sending", "media-b")],
    ["c", upload("c", "failed", "media-c")],
  ]);

  it("are the ones kept and each file sent that has an id, in their order", () => {
    const entries = [{ kept: "media-k" }, { upload: "a" }, { upload: "b" }, { upload: "c" }];
    expect(mediaIdsOf(entries, uploads)).toEqual(["media-k", "media-b"]);
  });

  it("wait while a file being sent has no id yet", () => {
    expect(isAskingOf([{ upload: "a" }], uploads)).toBe(true);
    expect(isAskingOf([{ kept: "media-k" }, { upload: "b" }, { upload: "c" }], uploads)).toBe(
      false,
    );
  });
});

describe("what of a session differs from the one it changes", () => {
  const session = {
    startedAt: new Date(2026, 9, 18, 7, 30),
    durationMinutes: 90,
    rating: 4,
    note: "Glassy",
    waveSize: "chest" as const,
    setSize: null,
  };
  const same: SessionDraft = {
    startedAt: new Date(2026, 9, 18, 7, 30),
    durationMinutes: 90,
    rating: 4,
    note: "Glassy",
    waveSize: "chest",
    setSize: null,
    mediaIds: ["m1"],
  };

  it("is nothing while each part is as it was", () => {
    expect(sessionChanges(session, same, ["m1"])).toEqual({});
  });

  it("is each part that changed, the photos when their order did", () => {
    expect(
      sessionChanges(session, { ...same, rating: null, note: "", mediaIds: ["m2", "m1"] }, [
        "m1",
        "m2",
      ]),
    ).toEqual({ rating: null, note: "", mediaIds: ["m2", "m1"] });
  });
});

describe("the day and the hour of a session, each set by its own picker", () => {
  it("keep each other as one changes", () => {
    const start = new Date(2026, 9, 18, 7, 45);
    expect(withDay(start, new Date(2026, 9, 12, 23, 0)).getTime()).toBe(
      new Date(2026, 9, 12, 7, 45).getTime(),
    );
    expect(withClock(start, new Date(2026, 0, 1, 16, 5)).getTime()).toBe(
      new Date(2026, 9, 18, 16, 5).getTime(),
    );
  });

  it("are said as today or yesterday by the calendar, whatever the hours", () => {
    const now = new Date(2026, 9, 3, 11, 0).getTime();
    expect(dayWords(new Date(2026, 9, 3, 0, 5), now)).toBe("Today");
    expect(dayWords(new Date(2026, 9, 2, 23, 55), now)).toBe("Yesterday");
    expect(dayWords(new Date(2026, 9, 1, 8, 0), now)).not.toBe("Yesterday");
  });
});

describe("where a new session most likely was", () => {
  const places = [
    { id: "parlementia", latitude: 43.4189, longitude: -1.6078 },
    { id: "avalanche", latitude: 43.4159, longitude: -1.6055 },
    { id: "hossegor", latitude: 43.6646, longitude: -1.4461 },
  ];

  it("is the nearest of the places offered, within twenty kilometres", () => {
    expect(nearestPlace(places, { latitude: 43.4161, longitude: -1.6058 })?.id).toBe("avalanche");
    expect(nearestPlace(places, { latitude: 43.66, longitude: -1.44 })?.id).toBe("hossegor");
  });

  it("is none when the phone is far from all of them, or says nothing", () => {
    expect(nearestPlace(places, { latitude: 48.85, longitude: 2.35 })).toBeNull();
    expect(nearestPlace(places, null)).toBeNull();
    expect(nearestPlace([], { latitude: 43.4, longitude: -1.6 })).toBeNull();
  });
});

describe("a place as a route names it", () => {
  it("is a break or a spot of the account's, by its id", () => {
    expect(placeOfParam("break:5b1c")).toEqual({ kind: "break", id: "5b1c" });
    expect(placeOfParam("spot:a:b")).toEqual({ kind: "spot", id: "a:b" });
    expect(placeParam({ kind: "spot", id: "a:b" })).toBe("spot:a:b");
  });

  it("is none for a station, an id alone, or nothing", () => {
    expect(placeOfParam("station:41")).toBeNull();
    expect(placeOfParam("5b1c")).toBeNull();
    expect(placeOfParam("break:")).toBeNull();
    expect(placeOfParam(undefined)).toBeNull();
  });
});
