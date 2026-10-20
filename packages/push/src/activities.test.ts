import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_ALERT,
  ACTIVITY_ATTRIBUTES_TYPE,
  type ActivityPush,
  WINDOW_ACTIVITY,
  type WindowShown,
  activityPayload,
} from "./activities";
import { readActivity, readToken, testApns } from "./testing";

// The pushes of the Live Activity of a window that begins: decision 074. No test asks Apple:
// `testApns` stands for it, and reads each push as the phone would.

const shown: WindowShown = {
  alertId: "6f0c2a5e-0c4e-4a8e-9a57-2d1a1f1e0b01",
  notificationId: "1b4c9d7e-3f2a-4b6c-8d9e-0a1b2c3d4e5f",
  start: "2026-10-20T08:00:00.000Z",
  end: "2026-10-20T11:00:00.000Z",
  more: 1,
  pauseUntil: "2026-10-20T22:00:00.000Z",
  sea: {
    at: "2026-10-20T08:00:00.000Z",
    heightMeters: 1.4,
    periodSeconds: 12,
    directionDegrees: 285,
  },
  wind: {
    observedAt: "2026-10-20T07:50:00.000Z",
    speedMetersPerSecond: 3.1,
    gustMetersPerSecond: 5.2,
    directionDegrees: 95,
    atShore: "offshore",
  },
  tide: { type: "high", time: "2026-10-20T10:12:00.000Z", heightMeters: 4.21 },
  buoy: {
    observedAt: "2026-10-20T07:30:00.000Z",
    heightMeters: 1.6,
    periodSeconds: 13,
    directionDegrees: 290,
  },
};
const STALE = new Date("2026-10-20T11:00:00Z");
const URL = "app.example://app?panel=alerts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a push of a Live Activity", () => {
  it("starts one by the token iOS gave to start it, in the shape expo-widgets reads", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-20T07:55:00Z"), toFake: ["Date"] });
    const apple = testApns();
    const iphone = apple.device();
    const start = apple.startToken();

    const outcome = await apple.pusher.activity(
      { token: start, appId: iphone.appId, environment: "production" },
      { event: "start", shown, staleAt: STALE, locale: "fr", url: URL },
      3 * 3600,
    );

    expect(outcome).toBe("taken");
    const [asked] = apple.asked();
    expect(asked?.headers).toMatchObject({
      ":path": `/3/device/${start}`,
      "apns-push-type": "liveactivity",
      "apns-topic": "org.example.app.push-type.liveactivity",
      "apns-priority": "10",
      "apns-expiration": String(Date.parse("2026-10-20T10:55:00Z") / 1000),
    });
    // Signed with the key that signs the alerts' pushes: decision 072.
    expect(
      readToken(asked?.headers.authorization?.replace(/^bearer /, ""), apple.publicKey)?.isSigned,
    ).toBe(true);
    expect(asked?.payload).toEqual({
      aps: {
        timestamp: Date.parse("2026-10-20T07:55:00Z") / 1000,
        event: "start",
        "content-state": { name: WINDOW_ACTIVITY, props: JSON.stringify(shown) },
        "stale-date": STALE.getTime() / 1000,
        "attributes-type": ACTIVITY_ATTRIBUTES_TYPE,
        attributes: { url: URL },
        "input-push-token": 1,
        alert: { ...ACTIVITY_ALERT.fr, sound: "default" },
      },
    });
    expect(apple.activities()).toEqual([
      {
        host: "https://api.push.apple.com",
        token: start,
        kind: "start",
        priority: 10,
        expiration: Date.parse("2026-10-20T10:55:00Z") / 1000,
        read: expect.objectContaining({
          event: "start",
          name: WINDOW_ACTIVITY,
          shown,
          attributes: { url: URL },
          alert: {
            title: "C’est le moment",
            body: "Un créneau d’une de tes alertes commence",
            sound: "default",
          },
          staleDate: STALE.getTime() / 1000,
          dismissalDate: null,
          inputPushToken: 1,
        }),
      },
    ]);
    // A Live Activity's push is no alert of the app's: the extension is sent nothing.
    expect(apple.sent()).toEqual([]);
  });

  it("lights the screen with a line that names nothing, in every language", () => {
    for (const words of Object.values(ACTIVITY_ALERT)) {
      expect(words.title.length).toBeGreaterThan(0);
      expect(words.body.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ACTIVITY_ALERT).sort()).toEqual(["en", "es", "fr", "pt"]);
  });

  it("is updated at the low priority, unless it tells a beginning", async () => {
    const apple = testApns();
    const iphone = apple.device();
    const token = apple.activityToken();
    const to = { token, appId: iphone.appId, environment: "production" as const };

    await apple.pusher.activity(to, { event: "update", shown, staleAt: STALE }, 3600);
    await apple.pusher.activity(
      to,
      { event: "update", shown: { ...shown, more: 2 }, staleAt: STALE, locale: "en" },
      3600,
    );

    const [quiet, told] = apple.activities();
    expect(quiet).toMatchObject({ kind: "activity", priority: 5 });
    expect(quiet?.read).toMatchObject({
      event: "update",
      shown,
      alert: null,
      staleDate: STALE.getTime() / 1000,
    });
    expect(quiet?.read.attributes).toBeNull();
    expect(told).toMatchObject({ priority: 10 });
    expect(told?.read).toMatchObject({
      event: "update",
      shown: { more: 2 },
      alert: { title: "It is on", body: "A window of one of your alerts begins" },
    });
  });

  it("is ended with the moment it leaves the screen", async () => {
    const apple = testApns();
    const iphone = apple.device();
    const token = apple.activityToken("development");
    const dismissAt = new Date("2026-10-20T11:00:00Z");

    expect(
      await apple.pusher.activity(
        { token, appId: iphone.appId, environment: "development" },
        { event: "end", shown, dismissAt },
        3600,
      ),
    ).toBe("taken");

    const [ended] = apple.activities();
    expect(ended).toMatchObject({ host: "https://api.sandbox.push.apple.com", priority: 10 });
    expect(ended?.read).toMatchObject({
      event: "end",
      shown,
      staleDate: null,
      dismissalDate: dismissAt.getTime() / 1000,
      alert: null,
    });
  });

  it("carries figures, times and the two ids, and nothing else", () => {
    const payload = activityPayload(
      { event: "start", shown, staleAt: STALE, locale: "en" },
      new Date("2026-10-20T07:55:00Z"),
    );

    const props = JSON.parse(payload.aps["content-state"].props) as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(
      [
        "alertId",
        "buoy",
        "end",
        "more",
        "notificationId",
        "pauseUntil",
        "sea",
        "start",
        "tide",
        "wind",
      ].sort(),
    );
    // Without an address to open, the attributes say none, as expo-widgets reads them.
    expect(payload.aps).toMatchObject({ attributes: {} });
  });

  describe("that does not leave", () => {
    const push: ActivityPush = { event: "update", shown, staleAt: STALE };

    it("is not sent to a token APNs did not give, nor to a device of another app", async () => {
      const apple = testApns();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        await apple.pusher.activity(
          { token: "not-a-token", appId: "org.example.app", environment: "production" },
          push,
          60,
        ),
      ).toBe("refused");
      expect(
        await apple.pusher.activity(
          { token: apple.activityToken(), appId: "org.example.other", environment: "production" },
          push,
          60,
        ),
      ).toBe("refused");
      expect(apple.asked()).toEqual([]);
      expect(errors.mock.calls.map(([line]) => String(line))).toEqual([
        "push: not taken (apns activity a token APNs did not give)",
        "push: not taken (apns activity a device of another app)",
      ]);
    });

    it("is gone when Apple says the token is no more, and refused when it says no", async () => {
      const apple = testApns();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const to = (token: string) => ({
        token,
        appId: "org.example.app",
        environment: "production" as const,
      });
      const ended = apple.activityToken();
      const throttled = apple.activityToken();
      apple.answers.set(ended, { status: 410, reason: "ExpiredToken" });
      apple.answers.set(throttled, { status: 429, reason: "TooManyRequests" });

      expect(await apple.pusher.activity(to(ended), push, 60)).toBe("gone");
      expect(await apple.pusher.activity(to(throttled), push, 60)).toBe("refused");
      // A token Apple does not know at that host, such as one of the sandbox's.
      expect(await apple.pusher.activity(to(apple.activityToken("development")), push, 60)).toBe(
        "gone",
      );
      const logged = errors.mock.calls.map(([line]) => String(line)).join("\n");
      expect(logged).toContain("push: not taken (apns activity TooManyRequests)");
      for (const token of [ended, throttled]) expect(logged).not.toContain(token);
    });

    it("is refused when it is too long for one push", async () => {
      const apple = testApns();
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        await apple.pusher.activity(
          { token: apple.activityToken(), appId: "org.example.app", environment: "production" },
          { ...push, shown: { ...shown, alertId: "x".repeat(5000) } },
          60,
        ),
      ).toBe("refused");
      expect(apple.asked()).toEqual([]);
    });
  });
});

describe("what the phone reads of a push of a Live Activity", () => {
  const start = activityPayload(
    { event: "start", shown, staleAt: STALE, locale: "en" },
    new Date("2026-10-20T07:55:00Z"),
  ).aps;

  it("is what the worker wrote", () => {
    expect(readActivity(start)).toMatchObject({ event: "start", name: WINDOW_ACTIVITY, shown });
  });

  it.each([
    ["properties that are an object, not a text", { "content-state": { name: "a", props: {} } }],
    ["a content with no name", { "content-state": { props: "{}" } }],
    ["properties that are a list", { "content-state": { name: "a", props: "[]" } }],
    ["attributes of another type", { "attributes-type": "OtherAttributes" }],
    ["an address that is not a text", { attributes: { url: 4 } }],
    ["a start that lights no screen", { alert: undefined }],
    ["an event ActivityKit does not know", { event: "pause" }],
  ])("is nothing the phone decodes with %s", (_what, changed) => {
    expect(() => readActivity({ ...start, ...changed })).toThrow();
  });
});
