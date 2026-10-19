import { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import https from "node:https";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FCM_SCOPE, GOOGLE_TOKEN_ADDRESS, createFcmPusher } from "./fcm";
import type { Push } from "./index";
import { testFcm } from "./testing";

// The pushes to the app on an Android phone: decision 072. No test asks Google: `testFcm` stands
// for it.

const push: Push = {
  title: "The bay: a window is taking shape",
  body: "Home: Sat 10 Oct, 08:00 to 12:00",
  url: "https://app.example.org/app?spot=home",
  tag: "a-tag",
  locale: "pt",
  thread: "alert:the-alert",
  category: "today",
  ids: { notification: "the-notification", alert: "the-alert" },
  level: "active",
  badge: 1,
};
const { locale: _locale, ...read } = push;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the pusher of an instance to its Android app", () => {
  const { settings } = testFcm();

  it("is none when the settings hold none of the three FCM_ variables", () => {
    expect(createFcmPusher({})).toBeNull();
  });

  const ec = generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();

  it("is not made of settings that cannot be right, and names what is missing and nothing of the key", () => {
    const said = (wrong: Parameters<typeof createFcmPusher>[0]) => {
      try {
        createFcmPusher(wrong);
      } catch (error) {
        return String(error);
      }
      return "made";
    };

    expect(said({ FCM_PROJECT_ID: settings.FCM_PROJECT_ID })).toContain(
      "Set FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY to push to the Android app",
    );
    expect(said({ ...settings, FCM_PRIVATE_KEY: "not a key" })).toContain(
      "FCM_PRIVATE_KEY is not a private key in PEM",
    );
    expect(said({ ...settings, FCM_PRIVATE_KEY: ec })).toContain("is not an RSA private key");
    expect(
      said({ ...settings, FCM_PRIVATE_KEY: settings.FCM_PRIVATE_KEY.slice(0, 90) }),
    ).not.toContain(settings.FCM_PRIVATE_KEY.slice(40, 90));
  });

  it("asks nothing of anyone when it is made", () => {
    const asked = [vi.spyOn(https, "request"), vi.spyOn(http, "request")];

    createFcmPusher(settings);

    for (const one of asked) expect(one).not.toHaveBeenCalled();
  });
});

describe("a push to an Android phone", () => {
  it("is a data message whose one field is what it says, encrypted for the phone", async () => {
    const google = testFcm();
    const phone = google.device();

    expect(await google.pusher.send(phone, push, 3600)).toBe("taken");

    expect(google.sent()).toEqual([
      {
        token: phone.token,
        priority: "HIGH",
        ttl: "3600s",
        fields: ["encrypted"],
        // Nothing for the system to show by itself, and no collapse key for Google to read.
        shown: false,
        collapseKey: null,
        push: read,
      },
    ]);
    const all = JSON.stringify(google.asked());
    for (const word of ["bay", "Home", "the-alert", "the-notification", "today", "a-tag"]) {
      expect(all).not.toContain(word);
    }
  });

  it("is urgent but for the evening before", async () => {
    const google = testFcm();
    const phone = google.device();

    for (const level of ["passive", "active", "time-sensitive"] as const) {
      await google.pusher.send(phone, { ...push, level }, 60);
    }

    expect(google.sent().map((sent) => sent.priority)).toEqual(["NORMAL", "HIGH", "HIGH"]);
  });

  it("tells Google how long to keep it, in whole seconds, four weeks at most", async () => {
    const google = testFcm();
    const phone = google.device();

    for (const seconds of [90.9, 0, -5, 365 * 24 * 60 * 60]) {
      await google.pusher.send(phone, push, seconds);
    }

    expect(google.sent().map((sent) => sent.ttl)).toEqual(["90s", "0s", "0s", "2419200s"]);
  });

  it("holds a report's picture while it fits, and goes without it otherwise", async () => {
    const google = testFcm();
    const phone = google.device();
    const image = `https://bucket.example.org/thumb.webp?${"s".repeat(400)}`;

    await google.pusher.send(phone, { ...push, image }, 60);
    await google.pusher.send(phone, { ...push, image, body: "b".repeat(2500) }, 60);

    const [whole, alone] = google.sent();
    expect(whole?.push.image).toBe(image);
    expect(alone?.push).not.toHaveProperty("image");
  });

  it("sends nothing that one push to an app cannot hold, nor to a token FCM did not give", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const google = testFcm();
    const phone = google.device();

    expect(await google.pusher.send(phone, { ...push, body: "b".repeat(3000) }, 60)).toBe(
      "refused",
    );
    expect(await google.pusher.send({ ...phone, token: "not a token" }, push, 60)).toBe("refused");
    expect(await google.pusher.send(phone, push, Number.POSITIVE_INFINITY)).toBe("refused");

    expect(google.asked()).toEqual([]);
    expect(google.exchanges()).toEqual([]);
    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (fcm too long for one push)",
      "push: not taken (fcm a token FCM did not give)",
      "push: not taken (fcm no time to keep it for)",
    ]);
  });

  it("says what became of it, by what Google answered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const google = testFcm();
    const phone = google.device();
    const outcomes: Record<string, string[]> = {};

    for (const [status, code] of [
      [404, "UNREGISTERED"],
      [403, "SENDER_ID_MISMATCH"],
      [400, "INVALID_ARGUMENT"],
      [429, "QUOTA_EXCEEDED"],
      [403, "THIRD_PARTY_AUTH_ERROR"],
      [500, "INTERNAL"],
      [503, "UNAVAILABLE"],
    ] as const) {
      google.answers.set(phone.token, { status, code });
      (outcomes[await google.pusher.send(phone, push, 60)] ??= []).push(code);
    }
    google.answers.set(phone.token, async () => ({ failure: "ECONNRESET" }));
    (outcomes[await google.pusher.send(phone, push, 60)] ??= []).push("no answer");
    google.answers.delete(phone.token);
    (outcomes[await google.pusher.send(phone, push, 60)] ??= []).push("200");

    expect(outcomes).toEqual({
      // The app left the phone, or its token is another project's.
      gone: ["UNREGISTERED", "SENDER_ID_MISMATCH"],
      refused: ["INVALID_ARGUMENT", "QUOTA_EXCEEDED", "THIRD_PARTY_AUTH_ERROR"],
      failed: ["INTERNAL", "UNAVAILABLE", "no answer"],
      taken: ["200"],
    });
  });

  it("logs how it was not taken, by FCM's code, and nothing of the token or of what it said", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const google = testFcm();
    const phone = google.device();

    google.answers.set(phone.token, { status: 429, code: "QUOTA_EXCEEDED" });
    await google.pusher.send(phone, push, 60);
    google.answers.set(phone.token, async () => ({ status: 500, body: `${phone.token} broke` }));
    await google.pusher.send(phone, push, 60);
    google.answers.set(phone.token, { status: 404, code: "UNREGISTERED" });
    await google.pusher.send(phone, push, 60);

    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (fcm QUOTA_EXCEEDED)",
      "push: not taken (fcm status 500)",
    ]);
  });
});

describe("the access token the instance pushes to Android with", () => {
  it("is given for a token the service account signed, for the scope of messaging alone, good for an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const google = testFcm();
    const issued = Date.parse("2026-10-19T08:00:00Z") / 1000;

    await google.pusher.send(google.device(), push, 60);

    expect(google.exchanges()).toEqual([
      {
        claims: {
          iss: google.settings.FCM_CLIENT_EMAIL,
          scope: FCM_SCOPE,
          aud: GOOGLE_TOKEN_ADDRESS,
          iat: issued,
          exp: issued + 3600,
        },
        isSigned: true,
      },
    ]);
  });

  it("is asked once for the pushes that leave together, and again five minutes before it ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
    const google = testFcm();
    google.tokens.lifetime = 3600;
    const phones = [google.device(), google.device(), google.device()];

    await Promise.all(phones.map((phone) => google.pusher.send(phone, push, 60)));
    vi.setSystemTime(new Date("2026-10-19T08:54:59Z"));
    await google.pusher.send(phones[0]!, push, 60);
    expect(google.exchanges()).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-19T08:55:00Z"));
    await google.pusher.send(phones[0]!, push, 60);
    expect(google.exchanges()).toHaveLength(2);
    expect(google.sent()).toHaveLength(5);
  });

  it("is asked again after Google no longer takes it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const google = testFcm();
    const phone = google.device();
    await google.pusher.send(phone, push, 60);

    google.revoke();
    expect(await google.pusher.send(phone, push, 60)).toBe("refused");
    expect(await google.pusher.send(phone, push, 60)).toBe("taken");

    expect(google.exchanges()).toHaveLength(2);
  });

  it("leaves a push unsent when Google gives none, and says so", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const google = testFcm();
    const phone = google.device();

    google.tokens.answer = async () => ({ status: 400, body: '{"error":"invalid_grant"}' });
    expect(await google.pusher.send(phone, push, 60)).toBe("refused");
    google.tokens.answer = async () => ({ status: 200, body: '{"token_type":"Bearer"}' });
    expect(await google.pusher.send(phone, push, 60)).toBe("refused");
    google.tokens.answer = async () => ({ failure: "given up" });
    expect(await google.pusher.send(phone, push, 60)).toBe("refused");

    expect(google.asked()).toEqual([]);
    expect(logged.mock.calls.map((call) => call.join(" "))).toEqual([
      "push: not taken (fcm no access token (status 400))",
      "push: not taken (fcm no access token (status 200))",
      "push: not taken (fcm no access token in time)",
    ]);
  });
});
