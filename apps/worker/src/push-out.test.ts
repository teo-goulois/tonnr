import { makeVapidKeys } from "@repo/push";
import { describe, expect, it } from "vitest";

import { pushOutOf } from "./deliveries";

describe("what an instance's settings let the worker send push with", () => {
  const keys = makeVapidKeys();
  const pair = { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };
  const CORS_ORIGIN = "https://app.example.org/";

  it("is a pusher and the web app's address, with a pair of keys and that address", () => {
    expect(pushOutOf({ ...pair, CORS_ORIGIN })).toMatchObject({
      webOrigin: "https://app.example.org",
      pusher: { send: expect.any(Function) },
    });
  });

  it("is nothing without keys, or without the web app's address", () => {
    expect(pushOutOf({ CORS_ORIGIN })).toBeNull();
    expect(pushOutOf({})).toBeNull();
    expect(pushOutOf(pair)).toBeNull();
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
});
