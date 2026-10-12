import { describe, expect, it } from "vitest";

import { type AlertMailContent, STARTING_UNITS, alertMail } from "./alerts";

const at = (time: string) => new Date(`2026-10-${time}:00Z`);
const content = (more: Partial<AlertMailContent> = {}): AlertMailContent => ({
  to: "ana@example.org",
  locale: "fr",
  moment: "found",
  alertName: "La baie",
  zone: "Europe/Paris",
  namesInSubject: true,
  units: STARTING_UNITS,
  lines: [
    {
      spotName: "Le banc",
      spotUrl: "https://app.example.org/fr/app?spot=s1",
      open: [{ start: at("12T06:00"), end: at("12T10:00") }],
      sea: {
        at: at("12T06:00"),
        swellHeightMeters: 1.8,
        swellPeriodSeconds: 11,
        windSpeedMetersPerSecond: 5,
      },
      forecastFetchedAt: at("11T18:20"),
    },
  ],
  forecastCredit: "Weather data by Open-Meteo.com.",
  settingsUrl: "https://app.example.org/fr/app?panel=alerts&alerts=settings",
  offUrl: "https://app.example.org/fr/mail-off?u=u1&k=key",
  offPostUrl: "https://api.example.org/v1/alert-mails/off?u=u1&k=key",
  ...more,
});

describe("the mail of an alert", () => {
  it("says the moment, the hours in the account's time, the forecast, and where to go", () => {
    const mail = alertMail(content());

    expect(mail.to).toBe("ana@example.org");
    expect(mail.subject).toBe("La baie : un créneau se dessine");
    // 06:00 UTC is 08:00 in Paris.
    expect(mail.text).toContain("Le banc\n  lun. 12 oct., 08:00 à 12:00\n");
    // The forecast of one hour, which it names, and when it was fetched.
    expect(mail.text).toContain(
      "Prévu pour lun. 12 oct., 08:00 : vagues 1,8 m, 11 s ; vent 10 nd (prévision lue dim. 11 oct., 20:20)",
    );
    expect(mail.text).toContain("Ouvrir le spot : https://app.example.org/fr/app?spot=s1");
    // The credit, and what its licence asks to be said of values that were changed.
    expect(mail.text).toContain(
      "Prévisions : Weather data by Open-Meteo.com. Ces valeurs sont arrondies et écrites dans tes unités.\n",
    );
    expect(mail.text).toContain("Régler tes alertes : https://app.example.org/fr/app?panel=alerts");
    expect(mail.text).toContain("Ne plus recevoir ces mails : https://app.example.org/fr/mail-off");
  });

  it("carries what lets a mail program switch alert mails off in one press", () => {
    expect(alertMail(content()).headers).toEqual([
      {
        name: "List-Unsubscribe",
        value: "<https://api.example.org/v1/alert-mails/off?u=u1&k=key>",
      },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("names nothing in its subject when the account asked so", () => {
    expect(alertMail(content({ namesInSubject: false })).subject).toBe(
      "Une de tes alertes Tonnr a du nouveau",
    );
    expect(alertMail(content({ namesInSubject: false, locale: "en" })).subject).toBe(
      "One of your Tonnr alerts has news",
    );
  });

  it("says what a window was when it moved, and what it was when it went", () => {
    const before = [{ start: at("12T06:00"), end: at("12T10:00") }];
    const moved = alertMail(
      content({
        moment: "moved",
        lines: [
          {
            spotName: "Le banc",
            spotUrl: "https://app.example.org/fr/app?spot=s1",
            open: [],
            moved: { open: [{ start: at("12T09:00"), end: at("12T13:00") }], before },
          },
        ],
      }),
    );
    expect(moved.subject).toBe("La baie : le créneau a bougé");
    expect(moved.text).toContain(
      "Le banc\n  A bougé : lun. 12 oct., 11:00 à 15:00 (c’était lun. 12 oct., 08:00 à 12:00)\n",
    );

    const gone = alertMail(
      content({
        moment: "gone",
        locale: "en",
        lines: [
          {
            spotName: "Le banc",
            spotUrl: "https://app.example.org/app?spot=s1",
            open: [],
            gone: before,
            // Nothing is said of the sea for hours that are gone, but when it was read.
            sea: {
              at: at("12T06:00"),
              swellHeightMeters: 0.4,
              swellPeriodSeconds: 6,
              windSpeedMetersPerSecond: 9,
            },
            forecastFetchedAt: at("11T18:20"),
          },
        ],
      }),
    );
    expect(gone.subject).toBe("La baie: the window is no longer forecast");
    expect(gone.text).toContain(
      "Le banc\n  No longer forecast: Mon 12 Oct, 08:00 to 12:00\n  Forecast fetched Sun 11 Oct, 20:20\n",
    );
    expect(gone.text).not.toContain("waves");
  });

  it("says in one mail what is new, what moved and what is gone at a spot", () => {
    const mail = alertMail(
      content({
        moment: "news",
        locale: "en",
        lines: [
          {
            spotName: "Le banc",
            spotUrl: "https://app.example.org/app?spot=s1",
            open: [{ start: at("14T06:00"), end: at("14T10:00") }],
            moved: {
              open: [{ start: at("12T09:00"), end: at("12T13:00") }],
              before: [{ start: at("12T06:00"), end: at("12T10:00") }],
            },
            gone: [{ start: at("13T06:00"), end: at("13T10:00") }],
            sea: {
              at: at("12T09:00"),
              swellHeightMeters: 1.8,
              swellPeriodSeconds: 11,
              swellDirectionDegrees: 270,
              windSpeedMetersPerSecond: 5,
              windDirectionDegrees: 90,
            },
          },
        ],
      }),
    );

    expect(mail.subject).toBe("La baie: there is news");
    expect(mail.text).toContain(
      [
        "Le banc",
        "  Wed 14 Oct, 08:00 to 12:00",
        "  Moved: Mon 12 Oct, 11:00 to 15:00 (it was Mon 12 Oct, 08:00 to 12:00)",
        "  No longer forecast: Tue 13 Oct, 08:00 to 12:00",
        // Where the swell and the wind come from, each with its figure.
        "  Forecast for Mon 12 Oct, 11:00: waves 1.8 m, 11 s, W 270° ; wind 10 kn, E 90°",
      ].join("\n"),
    );
  });

  it("lists a day for the evening before, with the alert of each spot", () => {
    const mail = alertMail(
      content({
        moment: "evening",
        alertName: null,
        day: "2026-10-12",
        namesInSubject: false,
        lines: [
          {
            spotName: "Le banc",
            alertName: "La baie",
            spotUrl: "https://app.example.org/fr/app?spot=s1",
            open: [{ start: at("12T06:00"), end: at("12T10:00") }],
          },
        ],
      }),
    );

    // The evening names a day, and no spot: it is said whatever the account asked of subjects.
    expect(mail.subject).toBe("Lundi 12 octobre : ce qui est prévu");
    expect(mail.text).toContain("Le banc (La baie)\n  lun. 12 oct., 08:00 à 12:00");
  });

  it("names the day an evening lists as its date says, east of the date line too", () => {
    const mail = alertMail(
      content({
        moment: "evening",
        alertName: null,
        day: "2026-10-12",
        // Noon UTC of that date is already the 13th there.
        zone: "Pacific/Kiritimati",
        locale: "en",
        lines: [
          {
            spotName: "The bank",
            spotUrl: "https://app.example.org/app?spot=s1",
            // 08:00 to 12:00 on Monday the 12th, at UTC+14.
            open: [{ start: at("11T18:00"), end: at("11T22:00") }],
          },
        ],
      }),
    );

    expect(mail.subject).toBe("Monday 12 October: what is forecast");
    expect(mail.text).toContain("The bank\n  Mon 12 Oct, 08:00 to 12:00");
  });

  it("gives what a station nearby measured when a window begins, as a reading and no more", () => {
    const mail = alertMail(
      content({
        moment: "begins",
        lines: [
          {
            spotName: "Le banc",
            spotUrl: "https://app.example.org/fr/app?spot=s1",
            open: [{ start: at("12T06:00"), end: at("12T10:00") }],
            station: {
              name: "Bouée 62001",
              distanceKm: 18.4,
              observedAt: at("12T05:30"),
              significantHeightMeters: 2.1,
              peakPeriodSeconds: 12,
              peakDirectionDegrees: 290,
              attribution: "Invented Sea Office",
            },
          },
        ],
      }),
    );

    expect(mail.subject).toBe("La baie : c’est le moment");
    // Where the waves come from is a point of the compass with its figure, in French.
    expect(mail.text).toContain(
      "Vagues à Bouée 62001, à 18 km : 2,1 m, 12 s, ONO 290°, lun. 12 oct., 07:30",
    );
    // The readings are credited to who measured them, beside the forecast.
    expect(mail.text).toContain("Mesures : Invented Sea Office\n");
    expect(mail.text).not.toMatch(/confirm/i);
  });

  it("writes every figure in the units its account reads in", () => {
    const mail = alertMail(
      content({
        locale: "en",
        moment: "begins",
        units: { windSpeed: "kmh", height: "ft", distance: "mi" },
        lines: [
          {
            spotName: "The bank",
            spotUrl: "https://app.example.org/app?spot=s1",
            open: [{ start: at("12T06:00"), end: at("12T10:00") }],
            sea: {
              at: at("12T06:00"),
              swellHeightMeters: 1.8,
              swellPeriodSeconds: 11,
              windSpeedMetersPerSecond: 5,
            },
            station: {
              name: "Buoy 62001",
              distanceKm: 18.4,
              observedAt: at("12T05:30"),
              significantHeightMeters: 2.1,
              peakPeriodSeconds: null,
              peakDirectionDegrees: null,
            },
          },
        ],
      }),
    );

    // 1.8 m is 5.9 ft, 5 m/s is 18 km/h, 2.1 m is 6.9 ft and 18.4 km is 11 mi.
    expect(mail.text).toContain(
      "Forecast for Mon 12 Oct, 08:00: waves 5.9 ft, 11 s ; wind 18 km/h",
    );
    expect(mail.text).toContain("Waves at Buoy 62001, 11 mi away: 6.9 ft, Mon 12 Oct, 07:30");
    expect(alertMail(content({ units: { ...STARTING_UNITS, windSpeed: "ms" } })).text).toContain(
      "vent 5 m/s",
    );
    expect(alertMail(content({ units: { ...STARTING_UNITS, windSpeed: "mph" } })).text).toContain(
      "vent 11 mph",
    );
  });

  it("writes what it is given as text in its page, whatever it holds", () => {
    const mail = alertMail(content({ alertName: `<b>"Sly" & co</b>` }));

    expect(mail.html).toContain("&lt;b&gt;&quot;Sly&quot; &amp; co&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>");
    // Nothing is loaded from elsewhere.
    expect(mail.html).not.toMatch(/<img|<script|<link/);
  });
});
