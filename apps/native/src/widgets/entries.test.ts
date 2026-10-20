import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor } from "@repo/client/sea-scales";
import { APP_NAME } from "@repo/config/app";
import { afterEach, describe, expect, it } from "vitest";

import { formatClock, formatDayAndClock, toKnots } from "@/lib/format";
import { destinationOfAddress } from "@/lib/links";
import { DEFAULT_UNITS, setUnits } from "@/lib/units";

import {
  goodUntil,
  HOURS_AHEAD,
  NEXT_HOURS,
  placeOptions,
  placeUrl,
  signedOutTimelines,
  timelineHours,
  timelinesOf,
  widgetPlaces,
} from "./entries";
import { FIRST_FAVORITE, WIDGET } from "./names";
import type { WidgetProps } from "./props";
import { answerOf, breakSea, buoySea, fetchedAt, hour, list, now, silentSpot } from "./samples";

const HOUR = 60 * 60 * 1000;

afterEach(() => setUnits(DEFAULT_UNITS));

/** Every value an entry holds, so that a test sees none is null or undefined. */
function leaves(value: unknown): unknown[] {
  if (value === null || typeof value !== "object") return [value];
  return Object.values(value).flatMap(leaves);
}

describe("the places the widgets read", () => {
  it("are the favourites first, then the other lists, each once, twelve at most", () => {
    const lists = [
      list({ id: "weekend", breakIds: ["b2", "b1"], stationIds: ["s1"] }),
      list({ id: "favorites", isDefault: true, spotIds: ["p1"], breakIds: ["b1"] }),
      list({ id: "far", breakIds: Array.from({ length: 20 }, (_, index) => `x${index}`) }),
    ];
    const { places, favorites } = widgetPlaces(lists);
    expect(places.slice(0, 5)).toEqual([
      { kind: "spot", id: "p1" },
      { kind: "break", id: "b1" },
      { kind: "break", id: "b2" },
      { kind: "station", id: "s1" },
      { kind: "break", id: "x0" },
    ]);
    expect(places).toHaveLength(12);
    expect(favorites).toEqual([
      { kind: "spot", id: "p1" },
      { kind: "break", id: "b1" },
    ]);
  });

  it("give the widget of the favourites their first three", () => {
    const lists = [list({ isDefault: true, breakIds: ["a", "b", "c", "d"] })];
    expect(widgetPlaces(lists).favorites.map((ref) => ref.id)).toEqual(["a", "b", "c"]);
  });

  it("are none without a list, and no favourites without the favourites", () => {
    expect(widgetPlaces([])).toEqual({ places: [], favorites: [] });
    expect(widgetPlaces([list({ breakIds: ["b1"] })]).favorites).toEqual([]);
  });
});

describe("a press on a widget", () => {
  it("opens the place in the app, as the parser of decision 073 reads it", () => {
    const site = "https://tonnr.app";
    expect(destinationOfAddress(placeUrl({ kind: "break", id: "b 1" }), site)).toEqual({
      route: "/place/break/b%201",
    });
    expect(destinationOfAddress(placeUrl({ kind: "spot", id: "p1" }), site)).toEqual({
      route: "/place/spot/p1",
    });
    expect(destinationOfAddress(placeUrl({ kind: "station", id: "ndbc:41001" }), site)).toEqual({
      route: "/place/station/ndbc%3A41001",
    });
  });
});

describe("a timeline", () => {
  it("has an entry for each hour of the kept forecast from the hour now, then a last one", () => {
    const { hours, end } = timelineHours([breakSea()], now);
    expect(hours.map((one) => one.toISOString())).toEqual([
      "2026-10-20T10:00:00.000Z",
      "2026-10-20T11:00:00.000Z",
      "2026-10-20T12:00:00.000Z",
      "2026-10-20T13:00:00.000Z",
    ]);
    expect(new Date(end).toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  it("reaches two days ahead at most", () => {
    const long = breakSea();
    long.forecast!.hours = Array.from({ length: 60 }, (_, index) =>
      hour(new Date(Date.parse("2026-10-20T10:00:00Z") + index * HOUR).toISOString(), 1),
    );
    expect(timelineHours([long], now).hours).toHaveLength(HOURS_AHEAD);
  });

  it("goes as far as the place that has figures the longest", () => {
    // The buoy's reading of 09:50 is shown six hours, until 15:50.
    expect(goodUntil(buoySea(), now)).toBe(Date.parse("2026-10-20T15:50:00Z"));
    const { hours, end } = timelineHours([breakSea(), buoySea()], now);
    expect(hours).toHaveLength(6);
    expect(new Date(end).toISOString()).toBe("2026-10-20T15:50:00.000Z");
  });

  it("ends an hour after it begins when no place has anything to show", () => {
    const { hours, end } = timelineHours([silentSpot()], now);
    expect(hours).toHaveLength(1);
    expect(end - hours[0]!.getTime()).toBe(HOUR);
  });
});

describe("what a widget of one place says", () => {
  const places = {
    places: [
      { kind: "break" as const, id: "b1" },
      { kind: "station" as const, id: "s1" },
      { kind: "spot" as const, id: "p1" },
    ],
    favorites: [{ kind: "break" as const, id: "b1" }],
  };
  const timelines = () =>
    timelinesOf({ answer: answerOf(breakSea(), buoySea(), silentSpot()), places, now });
  const at = (iso: string, name = WIDGET.seaNow) =>
    timelines()[name].find((entry) => entry.date.toISOString() === iso)!.props;

  it("is the hour's sea, written in the account's units, on the colors of the sea's scales", () => {
    const shown = at("2026-10-20T11:00:00.000Z").places!["break:b1"]!;
    expect(shown.name).toBe("La Côte");
    expect(shown.url).toBe(placeUrl({ kind: "break", id: "b1" }));
    expect(shown.figures).toEqual({
      height: {
        label: "1.4 m",
        color: scaleColor(WAVE_HEIGHT_SCALE, 1.4),
        ink: expect.any(String),
      },
      period: "12 s",
      wavesFrom: "WNW",
      wavesTo: 110,
      wind: {
        label: "10 kn",
        color: scaleColor(WIND_SPEED_SCALE, toKnots(5)),
        ink: expect.any(String),
      },
      shore: "Offshore",
      tide: `High tide ${formatClock(new Date("2026-10-20T14:10:00Z"))}`,
      spoken: `1.4 m, 12 s, from west-northwest, wind 10 kn, Offshore, High tide ${formatClock(new Date("2026-10-20T14:10:00Z"))}`,
    });
    expect(shown.note).toBe(`Forecast of ${formatClock(fetchedAt)}`);
  });

  it("follows the units the account chose", () => {
    setUnits({ ...DEFAULT_UNITS, height: "ft", windSpeed: "kmh" });
    const shown = at("2026-10-20T11:00:00.000Z").places!["break:b1"]!;
    expect(shown.figures?.height?.label).toBe("4.6 ft");
    expect(shown.figures?.wind?.label).toBe("18 km/h");
    expect(shown.figures?.spoken).toMatch(/^4\.6 ft, .*, wind 18 km\/h, /);
  });

  it("asks for the app to be opened once the kept forecast is over, with no figure", () => {
    const shown = at("2026-10-20T14:00:00.000Z").places!["break:b1"]!;
    expect(shown.figures).toBeUndefined();
    expect(shown.note).toBe(`Open ${APP_NAME} to see the sea`);
    expect(shown.url).toBe(placeUrl({ kind: "break", id: "b1" }));
  });

  it("says what a buoy measured, and when, until its reading is too old", () => {
    const measured = at("2026-10-20T15:00:00.000Z").places!["station:s1"]!;
    expect(measured.figures?.height?.label).toBe("1.6 m");
    expect(measured.note).toBe(`Measured at ${formatClock(new Date("2026-10-20T09:50:00Z"))}`);
    const last = timelines()[WIDGET.seaNow].at(-1)!;
    expect(last.date.toISOString()).toBe("2026-10-20T15:50:00.000Z");
    expect(last.props.places!["station:s1"]!.figures).toBeUndefined();
  });

  it("says nothing was measured at a place that had nothing, until the last entry", () => {
    expect(at("2026-10-20T10:00:00.000Z").places!["spot:p1"]!.note).toBe("No recent measurement");
    const last = timelines()[WIDGET.seaNow].at(-1)!.props.places!["spot:p1"]!;
    expect(last.note).toBe(`Open ${APP_NAME} to see the sea`);
  });

  it("names the day of a moment that is not the entry's", () => {
    const tomorrow = breakSea();
    tomorrow.forecast!.fetchedAt = new Date("2026-10-19T21:00:00Z");
    const [first] = timelinesOf({ answer: answerOf(tomorrow), places, now })[WIDGET.seaNow];
    expect(first!.props.places!["break:b1"]!.note).toBe(
      `Forecast of ${formatDayAndClock(new Date("2026-10-19T21:00:00Z"))}`,
    );
  });

  it("holds every place the widget may be set to, the favourites, and what it says without one", () => {
    const props = at("2026-10-20T10:00:00.000Z");
    expect(Object.keys(props.places!)).toEqual(["break:b1", "station:s1", "spot:p1"]);
    expect(props.favorites).toEqual(["break:b1"]);
    expect(props.view).toBe("sea");
    expect(props.empty?.title).toBe("No favorites yet");
    expect(props.missing).toEqual({
      title: "Can't show this place",
      body: "Widgets show your first 12 saved places, favorites first. Hold the widget to choose another.",
      url: "app.tonnr://app?panel=saved",
    });
  });

  it("holds no null and no undefined, which a property list cannot keep", () => {
    for (const entries of Object.values(timelines())) {
      for (const entry of entries) {
        expect(leaves(entry.props).filter((leaf) => leaf === null || leaf === undefined)).toEqual(
          [],
        );
      }
    }
  });
});

describe("what the widget of the next hours says", () => {
  const places = { places: [{ kind: "break" as const, id: "b1" }], favorites: [] };
  const entries = () =>
    timelinesOf({ answer: answerOf(breakSea()), places, now })[WIDGET.nextHours];

  it("is the hours ahead of each entry, five at most, none past the kept forecast", () => {
    const [first, , third] = entries();
    const hours = first!.props.places!["break:b1"]!.hours!;
    expect(hours.length).toBeLessThanOrEqual(NEXT_HOURS);
    expect(hours.map((one) => one.height?.label)).toEqual(["1.1 m", "1.4 m", "1.8 m", "2.2 m"]);
    expect(hours[0]).toMatchObject({ time: formatClock(new Date("2026-10-20T10:00:00Z")) });
    expect(third!.props.places!["break:b1"]!.hours!.map((one) => one.height?.label)).toEqual([
      "1.8 m",
      "2.2 m",
    ]);
    expect(third!.props.view).toBe("hours");
  });
});

describe("what the widget of the favourites says", () => {
  it("holds the favourites alone", () => {
    const places = {
      places: [
        { kind: "break" as const, id: "b1" },
        { kind: "break" as const, id: "b2" },
      ],
      favorites: [{ kind: "break" as const, id: "b2" }],
    };
    const answer = answerOf(breakSea("b1"), breakSea("b2", "Parlementia"));
    const [first] = timelinesOf({ answer, places, now })[WIDGET.favorites];
    expect(Object.keys(first!.props.places!)).toEqual(["break:b2"]);
    expect(first!.props.view).toBe("favorites");
  });

  it("asks for a favourite without the widget's settings, which it has none of", () => {
    const places = { places: [{ kind: "break" as const, id: "b1" }], favorites: [] };
    const [first] = timelinesOf({ answer: answerOf(breakSea()), places, now })[WIDGET.favorites];
    expect(first!.props.empty).toEqual({
      title: "No favorites yet",
      body: "Save a place to your favorites to see it here.",
      url: "app.tonnr://app?panel=saved",
    });
    expect(first!.props.missing).toBeUndefined();
  });
});

describe("a signed-out phone's widgets", () => {
  it("each say so in one entry, which opens the sign-in", () => {
    const timelines = signedOutTimelines();
    // Dated at the epoch, so that writing it again is writing the same.
    expect(timelines).toEqual(signedOutTimelines());
    expect(timelines[WIDGET.seaNow][0]!.date.getTime()).toBe(0);
    for (const name of Object.values(WIDGET)) {
      const entries: { props: WidgetProps }[] = timelines[name];
      expect(entries).toHaveLength(1);
      expect(entries[0]!.props.notice).toEqual({
        title: "Signed out",
        body: "Sign in to see the sea at your places.",
        url: "app.tonnr://sign-in",
      });
      expect(entries[0]!.props.places).toBeUndefined();
    }
  });
});

describe("the places a widget offers", () => {
  it("are the first of the favourites, then each place the answer gave, with what it is", () => {
    const refs = [
      { kind: "break" as const, id: "b1" },
      { kind: "station" as const, id: "s1" },
      { kind: "spot" as const, id: "gone" },
    ];
    expect(placeOptions(answerOf(breakSea(), buoySea()), refs)).toEqual([
      { name: "First of your favorites", value: FIRST_FAVORITE },
      { name: "La Côte", value: "break:b1", subtitle: "Surf break" },
      { name: "Buoy s1", value: "station:s1", subtitle: "Buoy" },
    ]);
  });

  it("are the first of the favourites alone before anything answered", () => {
    expect(placeOptions(null, [{ kind: "break", id: "b1" }])).toEqual([
      { name: "First of your favorites", value: FIRST_FAVORITE },
    ]);
  });
});
