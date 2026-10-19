import { makeVapidKeys } from "@repo/push";
import { testApns, testFcm } from "@repo/push/testing";
import { describe, expect, it } from "vitest";

import { kindsOf, pushOutOf } from "./deliveries";

describe("what an instance's settings let the worker send push with", () => {
  const keys = makeVapidKeys();
  const pair = { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };
  const CORS_ORIGIN = "https://app.example.org/";
  // Apple's key and Google's account, made for these tests: decision 072.
  const apple = testApns().settings;
  const google = testFcm().settings;

  it("is a pusher and the web app's address, with a pair of keys and that address", () => {
    const out = pushOutOf({ ...pair, CORS_ORIGIN });

    expect(out).toMatchObject({
      webOrigin: "https://app.example.org",
      web: { send: expect.any(Function) },
      ios: null,
      android: null,
    });
    expect(kindsOf(out!)).toEqual(["web"]);
  });

  it("pushes to the apps with Apple's key or Google's account, with no pair of keys for browsers", () => {
    expect(kindsOf(pushOutOf({ ...apple, CORS_ORIGIN })!)).toEqual(["ios"]);
    expect(kindsOf(pushOutOf({ ...google, CORS_ORIGIN })!)).toEqual(["android"]);
    expect(kindsOf(pushOutOf({ ...pair, ...apple, ...google, CORS_ORIGIN })!)).toEqual([
      "web",
      "ios",
      "android",
    ]);
  });

  it("is nothing without any way out, or without the web app's address, where a push leads", () => {
    expect(pushOutOf({ CORS_ORIGIN })).toBeNull();
    expect(pushOutOf({})).toBeNull();
    expect(pushOutOf(pair)).toBeNull();
    expect(pushOutOf({ ...apple, ...google })).toBeNull();
    // The team alone is Sign in with Apple's too: it pushes nothing by itself.
    expect(pushOutOf({ APPLE_TEAM_ID: apple.APPLE_TEAM_ID, CORS_ORIGIN })).toBeNull();
  });

  it("stops the worker on a pair that is not one, whether it could send or not, and names no key", () => {
    const other = makeVapidKeys();
    const broken = { ...pair, VAPID_PUBLIC_KEY: other.publicKey };

    for (const settings of [broken, { ...broken, CORS_ORIGIN }]) {
      let said = "";
      try {
        pushOutOf(settings);
      } catch (error) {
        said = String(error);
      }
      expect(said).toContain("VAPID_PUBLIC_KEY is not the public key of VAPID_PRIVATE_KEY");
      expect(said).not.toContain(keys.privateKey);
      expect(said).not.toContain(other.publicKey);
    }
    expect(() => pushOutOf({ VAPID_PRIVATE_KEY: keys.privateKey, CORS_ORIGIN })).toThrow(
      "or neither",
    );
  });

  it("stops the worker on some of an app's variables without the others, and names what is missing", () => {
    const { APNS_TOPIC: _topic, ...noTopic } = apple;
    const { FCM_PRIVATE_KEY: _key, ...noKey } = google;

    expect(() => pushOutOf({ ...pair, ...noTopic, CORS_ORIGIN })).toThrow("Set APNS_TOPIC");
    expect(() => pushOutOf({ ...pair, ...noKey, CORS_ORIGIN })).toThrow("Set FCM_PRIVATE_KEY");
    expect(() => pushOutOf({ ...apple, APNS_PRIVATE_KEY: "not a key", CORS_ORIGIN })).toThrow(
      "APNS_PRIVATE_KEY is not a private key in PEM",
    );
  });
});
