import { STARTING_UNITS } from "@repo/mail/alert-words";
import { describe, expect, it } from "vitest";

import { type AlertPushContent, alertPush } from "./alerts";
import { PUSH_BYTES } from "./encrypt";

const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const morning = [{ start: at("12T06:00"), end: at("12T10:00") }];
const sea = {
  at: at("12T06:00"),
  swellHeightMeters: 1.8,
  swellPeriodSeconds: 11,
  swellDirectionDegrees: 270,
  windSpeedMetersPerSecond: 5,
  windDirectionDegrees: 90,
};
// A spot of an alert, and the window that is told there.
const spot = { spotId: "s1", spotName: "Le banc", windows: ["w1"] };
const content = (more: Partial<AlertPushContent> = {}): AlertPushContent => ({
  locale: "fr",
  moment: "found",
  alertId: "bay",
  alertName: "La baie",
  zone: "Europe/Paris",
  units: STARTING_UNITS,
  lines: [{ ...spot, open: morning, sea }],
  page: "https://app.example.org/fr",
  ...more,
});

describe("the push of an alert", () => {
  it("says the moment, the hours in the account's time, the sea, and the page to open", () => {
    expect(alertPush(content())).toEqual({
      title: "La baie : un créneau se dessine",
      // 06:00 UTC is 08:00 in Paris. A direction is a point of the compass with its figure.
      body: "Le banc : lun. 12 oct., 08:00 à 12:00\nPrévu pour lun. 12 oct., 08:00 : vagues 1,8 m, 11 s, O 270° ; vent 10 nd, E 90°",
      url: "https://app.example.org/fr/app?spot=s1",
      tag: expect.stringMatching(/^[\w-]{22}$/),
    });
  });

  it("is written in the account's language and units", () => {
    const push = alertPush(
      content({
        locale: "en",
        zone: "UTC",
        units: { windSpeed: "kmh", height: "ft", distance: "mi" },
        page: "https://app.example.org",
      }),
    );

    expect(push.title).toBe("La baie: a window is taking shape");
    // 1.8 m is 5.9 ft, and 5 m/s is 18 km/h.
    expect(push.body).toBe(
      "Le banc: Mon 12 Oct, 06:00 to 10:00\nForecast for Mon 12 Oct, 06:00: waves 5.9 ft, 11 s, W 270° ; wind 18 km/h, E 90°",
    );
    expect(push.url).toBe("https://app.example.org/app?spot=s1");
  });

  it("says what a window was when it moved, and what it was when it went", () => {
    const later = [{ start: at("12T09:00"), end: at("12T13:00") }];
    const moved = alertPush(
      content({
        locale: "en",
        moment: "moved",
        lines: [{ ...spot, open: [], moved: { open: later, before: morning } }],
      }),
    );
    expect(moved.title).toBe("La baie: the window has moved");
    expect(moved.body).toBe(
      "Le banc: Moved: Mon 12 Oct, 11:00 to 15:00 (it was Mon 12 Oct, 08:00 to 12:00)",
    );

    const gone = alertPush(
      content({
        moment: "gone",
        // Nothing is said of the sea for hours that are gone.
        lines: [{ ...spot, open: [], gone: morning, sea }],
      }),
    );
    expect(gone.title).toBe("La baie : le créneau n’est plus prévu");
    expect(gone.body).toBe("Le banc : Plus prévu : lun. 12 oct., 08:00 à 12:00");
  });

  it("says that it is on with what a station nearby measured, or else with the forecast", () => {
    const begins = content({ locale: "en", moment: "begins" });
    const station = {
      name: "Belle-Île",
      distanceKm: 12.4,
      observedAt: at("12T05:40"),
      significantHeightMeters: 1.6,
      peakPeriodSeconds: 10.6,
      peakDirectionDegrees: 281.25,
    };

    expect(
      alertPush({ ...begins, lines: [{ ...spot, open: morning, sea, station }] }),
    ).toMatchObject({
      title: "La baie: it is on",
      body: "Le banc: Mon 12 Oct, 08:00 to 12:00\nWaves at Belle-Île, 12 km away: 1.6 m, 11 s, WNW 281°, Mon 12 Oct, 07:40",
    });
    // Far from any station, or with a reading that has no height: what the forecast gave.
    for (const without of [null, { ...station, significantHeightMeters: null }]) {
      expect(
        alertPush({ ...begins, lines: [{ ...spot, open: morning, sea, station: without }] }).body,
      ).toBe(
        "Le banc: Mon 12 Oct, 08:00 to 12:00\nForecast for Mon 12 Oct, 08:00: waves 1.8 m, 11 s, W 270° ; wind 10 kn, E 90°",
      );
    }
    // And the hours alone when the last look kept nothing of the sea.
    expect(alertPush({ ...begins, lines: [{ ...spot, open: morning }] }).body).toBe(
      "Le banc: Mon 12 Oct, 08:00 to 12:00",
    );
  });

  it("gives the hours of the first spots, says how many more there are, and opens what was told", () => {
    const spots = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        spotId: `s${index + 1}`,
        spotName: `Spot ${index + 1}`,
        windows: ["w1"],
        open: morning,
        sea,
      }));

    expect(alertPush(content({ locale: "en", lines: spots(2) }))).toMatchObject({
      body: "Spot 1: Mon 12 Oct, 08:00 to 12:00\nSpot 2: Mon 12 Oct, 08:00 to 12:00",
      url: "https://app.example.org/fr/app?panel=alerts",
    });
    expect(alertPush(content({ locale: "en", lines: spots(3) })).body).toBe(
      "Spot 1: Mon 12 Oct, 08:00 to 12:00\nSpot 2: Mon 12 Oct, 08:00 to 12:00\nand 1 more",
    );
    expect(alertPush(content({ lines: spots(3) })).body).toContain("\net 1 autre");
    expect(alertPush(content({ lines: spots(12) })).body).toContain("\net 10 autres");
    expect(alertPush(content({ locale: "en", lines: spots(12) })).body).toContain("\nand 10 more");
  });

  describe("of the evening before", () => {
    const afternoon = [{ start: at("12T12:00"), end: at("12T16:00") }];
    const evening = (lines: AlertPushContent["lines"]) =>
      alertPush(
        content({
          locale: "en",
          moment: "evening",
          alertId: null,
          alertName: null,
          day: "2026-10-12",
          lines,
        }),
      );
    const listed = (spotId: string, alertName: string, open = morning) => ({
      spotId,
      spotName: spotId === "s1" ? "Le banc" : `Spot ${spotId}`,
      alertName,
      windows: [],
      open,
    });

    it("lists the next day, each spot under its alert", () => {
      expect(evening([listed("s1", "La baie"), listed("s2", "La baie")])).toMatchObject({
        title: "Monday 12 October: what is forecast",
        body: "Le banc (La baie): Mon 12 Oct, 08:00 to 12:00\nSpot s2 (La baie): Mon 12 Oct, 08:00 to 12:00",
        url: "https://app.example.org/fr/app?panel=alerts",
      });
    });

    it("gives a spot one row, whatever the alerts it is listed under, and opens it", () => {
      expect(
        evening([listed("s1", "La baie"), listed("s1", "Gros jours", afternoon)]),
      ).toMatchObject({
        body: "Le banc: (La baie) Mon 12 Oct, 08:00 to 12:00 · (Gros jours) Mon 12 Oct, 14:00 to 18:00",
        // One spot, in two alerts: its page.
        url: "https://app.example.org/fr/app?spot=s1",
      });
    });

    it("counts spots, not the alerts of one: the second spot is told, and the rest are more", () => {
      // One spot under three alerts is one spot, and nothing more.
      const one = evening([listed("s1", "A"), listed("s1", "B"), listed("s1", "C")]).body;
      expect(one.split("\n")).toHaveLength(1);
      // The first spot under two alerts, then another: both are among the first two.
      const two = evening([listed("s1", "A"), listed("s1", "B"), listed("s2", "A")]).body;
      expect(two.split("\n")).toEqual([
        "Le banc: (A) Mon 12 Oct, 08:00 to 12:00 · (B) Mon 12 Oct, 08:00 to 12:00",
        "Spot s2 (A): Mon 12 Oct, 08:00 to 12:00",
      ]);
      const four = evening([
        listed("s1", "A"),
        listed("s2", "A"),
        listed("s1", "B"),
        listed("s3", "A"),
        listed("s4", "B"),
      ]).body;
      expect(four.split("\n")[2]).toBe("and 2 more");
    });
  });

  it("fits one push whatever the alert holds, and still says the moment and the hours", () => {
    // Names as long as the API takes them and longer, of signs that take four bytes each, with
    // what would break a line, and more hours than a line holds.
    const long = `${"🌊".repeat(90)}\n"quoted"\u0000\ttab`;
    const pieces = Array.from({ length: 14 }, (_, index) => ({
      start: new Date(at("12T06:00").getTime() + index * 12 * 60 * 60 * 1000),
      end: new Date(at("12T08:00").getTime() + index * 12 * 60 * 60 * 1000),
    }));
    const lines = Array.from({ length: 12 }, (_, index) => ({
      spotId: `spot-${index}-${"x".repeat(40)}`,
      spotName: `${index} ${long}`,
      alertName: long,
      windows: pieces.map((piece) => piece.start.toISOString()),
      open: pieces,
      moved: { open: pieces, before: pieces },
      gone: pieces,
      sea,
    }));

    for (const locale of ["en", "fr"] as const) {
      for (const moment of ["news", "evening"] as const) {
        const push = alertPush(
          content({
            locale,
            moment,
            alertName: long,
            ...(moment === "evening" ? { day: "2026-10-12" } : {}),
            lines,
          }),
        );

        expect(Buffer.byteLength(JSON.stringify(push))).toBeLessThan(PUSH_BYTES / 2);
        expect([...push.title].length).toBeLessThanOrEqual(80);
        const rows = push.body.split("\n");
        expect(rows).toHaveLength(3);
        for (const row of rows) expect([...row].length).toBeLessThanOrEqual(120);
        // The name is cut, and what follows it is said.
        expect(push.title).toMatch(
          moment === "evening"
            ? /what is forecast$|ce qui est prévu$/
            : /there is news$|du nouveau$/,
        );
        expect(rows[0]).toMatch(/^0 🌊+… \(🌊+…\) ?: (Mon 12 Oct|lun\. 12 oct\.), 08:00 /u);
        expect(rows[0]).toMatch(/…$/);
        expect(rows[2]).toBe(locale === "en" ? "and 10 more" : "et 10 autres");
        // No sign is cut in two, and nothing breaks a line or has to be written as a code.
        expect(push.body.isWellFormed()).toBe(true);
        expect(JSON.stringify(push)).not.toMatch(/\\u0000|\\t|\\n"quoted/);
      }
    }
  });

  it("writes a name on one line, and cuts it between two signs, never inside one", () => {
    const named = (spotName: string) =>
      alertPush(content({ locale: "en", lines: [{ ...spot, spotName, open: morning }] })).body;

    // What would break the line, or would have to be written as a code, becomes a space.
    expect(named("Le\nbanc\t\u0000 du\r\n large ")).toBe(
      "Le banc du large: Mon 12 Oct, 08:00 to 12:00",
    );
    // A flag is two signs to a program and one to a reader, and so is a letter with its accent.
    expect(named("🇫🇷".repeat(40))).toMatch(/^(🇫🇷){15}…: Mon 12 Oct/u);
    expect(named("é".repeat(40))).toMatch(/^(é){15}…: Mon 12 Oct/u);
    // A name that fits is left as it is.
    expect(named("🇫🇷".repeat(16))).toMatch(/^(🇫🇷){16}: Mon 12 Oct/u);
  });

  it("never names a direction without its figure", () => {
    const points = "N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW";
    for (let degrees = 0; degrees < 360; degrees += 7.5) {
      const { body } = alertPush(
        content({
          locale: "en",
          lines: [
            {
              ...spot,
              spotName: "x",
              open: morning,
              sea: { ...sea, swellDirectionDegrees: degrees, windDirectionDegrees: degrees + 180 },
            },
          ],
        }),
      );
      const said = body.split("\n")[1] ?? "";
      expect(said.match(new RegExp(`\\b(${points}) \\d{1,3}°`, "g"))).toHaveLength(2);
      expect(said.replace(new RegExp(`\\b(${points}) \\d{1,3}°`, "g"), "")).not.toMatch(
        new RegExp(`, (${points})\\b`),
      );
    }
  });

  describe("is shown under a tag", () => {
    const later = [{ start: at("12T09:00"), end: at("12T13:00") }];
    const found = alertPush(content()).tag;
    const tag = (more: Partial<AlertPushContent>) => alertPush(content(more)).tag;

    it("that every word on the same window has, so that the newest takes the place of the others", () => {
      // The window moved, moved again, then went: each said under the name it was found with.
      const moved = { ...spot, open: [], moved: { open: later, before: morning } };
      const again = {
        ...spot,
        open: [],
        moved: { open: [{ start: at("12T12:00"), end: at("12T16:00") }], before: later },
      };
      expect(tag({ moment: "moved", lines: [moved] })).toBe(found);
      expect(tag({ moment: "moved", lines: [again] })).toBe(found);
      expect(tag({ moment: "gone", lines: [{ ...spot, open: [], gone: later }] })).toBe(found);
      // It is on: the window that begins is the one that was found.
      expect(tag({ moment: "begins" })).toBe(found);
      // Whatever the language, the names, and the hours the window is at.
      expect(
        tag({
          locale: "en",
          alertName: "Renamed",
          lines: [{ ...spot, spotName: "Renamed", open: later }],
        }),
      ).toBe(found);
    });

    it("that no word on another window, another spot or another alert has", () => {
      const others = [
        tag({ lines: [{ ...spot, windows: ["w2"], open: morning }] }),
        tag({ lines: [{ ...spot, spotId: "s2", open: morning }] }),
        tag({ alertId: "other" }),
        // Two spots of the alert, and two windows of one spot: each says more than the first.
        tag({
          lines: [
            { ...spot, open: morning },
            { ...spot, spotId: "s2", open: morning },
          ],
        }),
        tag({ lines: [{ ...spot, windows: ["w1", "w2"], open: [...morning, ...later] }] }),
        tag({ moment: "evening", alertId: null, day: "2026-10-12" }),
        tag({ moment: "evening", alertId: null, day: "2026-10-13" }),
      ];

      expect(new Set([found, ...others]).size).toBe(others.length + 1);
    });

    it("that is another when its spots are shown in another order: the first of them are others", () => {
      const three = ["s1", "s2", "s3"].map((spotId) => ({
        ...spot,
        spotId,
        spotName: spotId,
        open: morning,
      }));
      const first = alertPush(content({ lines: three }));
      const turned = alertPush(content({ lines: three.toReversed() }));

      // What is shown is not the same: neither may take the other's place.
      expect(turned.body).not.toBe(first.body);
      expect(turned.tag).not.toBe(first.tag);
      // The windows of a spot are the same thing in whatever order they are named.
      expect(tag({ lines: [{ ...spot, windows: ["w2", "w1"], open: morning }] })).toBe(
        tag({ lines: [{ ...spot, windows: ["w1", "w2"], open: morning }] }),
      );
    });
  });
});
