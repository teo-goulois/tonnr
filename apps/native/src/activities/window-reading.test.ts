import { describe, expect, it } from "vitest";

import {
  type WindowKept,
  type WindowShown,
  keptForWindow,
  layoutWith,
  readWindow,
} from "./window-reading";

// What a push of the worker carries, as `windowShown` in apps/worker/src/live-activities.ts
// writes it: figures in the API's units, rounded as a screen shows them.
const shown: WindowShown = {
  alertId: "alert-1",
  notificationId: "6f1c0d4e-5f3a-4b7e-9a51-2a8f0e4c9d10",
  start: "2026-10-20T07:00:00.000Z",
  end: "2026-10-20T11:00:00.000Z",
  more: 0,
  pauseUntil: "2026-10-20T22:00:00.000Z",
  sea: {
    at: "2026-10-20T08:00:00.000Z",
    heightMeters: 1.8,
    periodSeconds: 12,
    directionDegrees: 290,
  },
  wind: {
    observedAt: "2026-10-20T07:50:00.000Z",
    speedMetersPerSecond: 5.1,
    gustMetersPerSecond: 7.7,
    directionDegrees: 100,
    atShore: "offshore",
  },
  tide: { type: "high", time: "2026-10-20T10:32:00.000Z", heightMeters: 3.1 },
  buoy: {
    observedAt: "2026-10-20T07:30:00.000Z",
    heightMeters: 1.6,
    periodSeconds: 11,
    directionDegrees: 285,
  },
};

const writing = {
  windPerMs: 3600 / 1852,
  wind: "kn",
  heightPerM: 1,
  height: "m",
  period: "s",
  decimal: ",",
  words: {
    high: "Pleine mer",
    low: "Basse mer",
    buoy: "Bouée",
    gusts: "rafales {speed}",
    until: "jusqu’à",
    moreOne: "et 1 autre spot",
    more: "et {count} autres spots",
    notToday: "Pas aujourd’hui",
    logSession: "Noter une session",
    compass: "N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSO,SO,OSO,O,ONO,NO,NNO",
    names:
      "nord,nord-nord-est,nord-est,est-nord-est,est,est-sud-est,sud-est,sud-sud-est,sud,sud-sud-ouest,sud-ouest,ouest-sud-ouest,ouest,ouest-nord-ouest,nord-ouest,nord-nord-ouest",
    from: "de secteur",
    shore: { offshore: "offshore", onshore: "onshore" },
    progress: "Avancée du créneau",
    label: "C’est le moment",
  },
};

const alerts = [
  {
    id: "alert-1",
    name: "Grosse houle",
    places: [{ spotId: null, breakId: "break-9", name: "Parlementia" }],
  },
  {
    id: "alert-2",
    name: "Le soir",
    places: [
      { spotId: "spot-1", breakId: null, name: "Chez moi" },
      { spotId: null, breakId: "break-2", name: "Avalanche" },
    ],
  },
];

const kept: WindowKept = keptForWindow(alerts, writing);

describe("what the app writes beside the layout", () => {
  it("names each alert, and the place of an alert on one place, by the alert's id", () => {
    expect(kept.alerts["alert-1"]).toEqual({
      name: "Grosse houle",
      place: "Parlementia",
      at: "break:break-9",
    });
    expect(kept.alerts["alert-2"]).toEqual({ name: "Le soir", place: null, at: null });
  });

  it("holds the sixteen points of the compass and the app's scheme", () => {
    expect(kept.words.compass).toHaveLength(16);
    expect(kept.words.names).toHaveLength(16);
    expect(kept.scheme).toBe("app.tonnr");
  });
});

describe("what the activity of a window writes of a push", () => {
  const read = readWindow(shown, kept);

  it("names the alert and its place from what the app wrote, never from the push", () => {
    expect(read.title).toBe("Grosse houle");
    expect(read.place).toBe("Parlementia");
    expect(read.more).toBeNull();
  });

  it("writes the sea, the wind and the tide in the account's units and language", () => {
    expect(read.sea).toBe("1,8 m · 12 s");
    expect(read.height).toBe("1,8 m");
    // 5.1 m/s is 9.9 knots, and the gusts 15.
    expect(read.wind).toEqual({
      speed: "10 kn",
      from: { toward: 280, point: "E", spoken: "de secteur est" },
      rest: "· rafales 15 kn · offshore",
      spoken: "10 kn, de secteur est, rafales 15 kn, offshore",
    });
    expect(read.tide).toEqual({
      word: "Pleine mer",
      at: Date.parse("2026-10-20T10:32:00.000Z"),
      height: "3,1 m",
    });
    expect(read.buoy).toEqual({
      text: "Bouée 1,6 m · 11 s",
      at: Date.parse("2026-10-20T07:30:00.000Z"),
    });
  });

  it("draws where the sea comes from as an arrow toward where it goes, then the point", () => {
    expect(read.seaFrom).toEqual({
      toward: 110,
      point: "ONO",
      spoken: "de secteur ouest-nord-ouest",
    });
  });

  it("writes what of the wind was measured, and nothing when nothing was", () => {
    const measured = shown.wind;
    if (!measured) throw new Error("the sample has a wind");
    const calm = (wind: Partial<typeof measured>) =>
      readWindow({ ...shown, wind: { ...measured, ...wind } }, kept).wind;
    expect(calm({ speedMetersPerSecond: null })).toEqual({
      speed: null,
      from: { toward: 280, point: "E", spoken: "de secteur est" },
      rest: "· rafales 15 kn · offshore",
      spoken: "de secteur est, rafales 15 kn, offshore",
    });
    expect(calm({ speedMetersPerSecond: null, directionDegrees: null })).toEqual({
      speed: null,
      from: null,
      rest: "rafales 15 kn · offshore",
      spoken: "rafales 15 kn, offshore",
    });
    expect(
      calm({
        speedMetersPerSecond: null,
        gustMetersPerSecond: null,
        directionDegrees: null,
        atShore: null,
      }),
    ).toBeNull();
  });

  it("writes heights in feet for an account that reads them so", () => {
    const feet = keptForWindow(alerts, { ...writing, heightPerM: 1 / 0.3048, height: "ft" });
    expect(readWindow(shown, feet).sea).toBe("5,9 ft · 12 s");
  });

  it("says how many more places are on, and what a push leaves out it leaves out too", () => {
    const quiet = readWindow({ ...shown, more: 2, wind: null, buoy: null, tide: null }, kept);
    expect(quiet.more).toBe("et 2 autres spots");
    expect(quiet.wind).toBeNull();
    expect(quiet.buoy).toBeNull();
    expect(quiet.tide).toBeNull();
    expect(readWindow({ ...shown, more: 1 }, kept).more).toBe("et 1 autre spot");
  });

  it("shows no name for an alert the app has not read yet", () => {
    const unknown = readWindow({ ...shown, alertId: "alert-new" }, kept);
    expect(unknown.title).toBeNull();
    expect(unknown.place).toBeNull();
    expect(unknown.session).toBe("app.tonnr://session/new");
  });

  it("opens the app on a session at the place, or on the pause of the day the push spoke of", () => {
    expect(read.session).toBe("app.tonnr://session/new?place=break%3Abreak-9");
    expect(read.pause).toBe(
      "app.tonnr://pause-alert?alert=alert-1&until=2026-10-20T22%3A00%3A00.000Z",
    );
  });

  it("gives the window's start and end as moments", () => {
    expect(read.end - read.start).toBe(4 * 60 * 60 * 1000);
  });
});

describe("the layout as expo-widgets keeps it", () => {
  it("is one function that gives the layout the reading and what the app wrote", () => {
    // What the build writes out, as a layout of its own: here, one that answers what it was given.
    const layout =
      "function(props,environment,read,kept){return {read:read(props,kept),dark:environment.colorScheme==='dark'};}";
    const written = layoutWith(layout, readWindow, kept);
    // The widget's runtime evaluates it as `(<layout>)`.
    // oxlint-disable-next-line no-new-func
    const evaluated = new Function(`return (${written});`)() as (
      props: unknown,
      environment: unknown,
    ) => { read: { title: string; sea: string }; dark: boolean };
    const drawn = evaluated(shown, { colorScheme: "dark" });
    expect(drawn.read.title).toBe("Grosse houle");
    expect(drawn.read.sea).toBe("1,8 m · 12 s");
    expect(drawn.dark).toBe(true);
  });
});
