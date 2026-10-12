import { describe, expect, it } from "vitest";

import { isCurvePoint, pushKeyOf } from "./push";
import { makeVapidKeys } from "./testing";

// Decision 031, "Push". A key of the right length that is on no curve can be used for nothing.
describe("a key of web push", () => {
  const point = () => makeVapidKeys().publicKey;
  // 65 bytes that begin as a point of the curve does, and are on none.
  const OFF_THE_CURVE = Buffer.from([4, ...Array<number>(64).fill(1)]).toString("base64url");

  it("is a point of the curve P-256, or is not", async () => {
    expect(await isCurvePoint(point())).toBe(true);
    expect(await isCurvePoint(OFF_THE_CURVE)).toBe(false);
    expect(await isCurvePoint("too-short")).toBe(false);
    expect(await isCurvePoint("")).toBe(false);
  });

  it("is given to browsers by an instance that holds one, and by no other", async () => {
    const key = point();

    expect(await pushKeyOf({ VAPID_PUBLIC_KEY: key })).toBe(key);
    expect(await pushKeyOf({})).toBeUndefined();
    expect(await pushKeyOf({ VAPID_PUBLIC_KEY: "" })).toBeUndefined();
  });

  it("stops an instance whose key no browser could subscribe with, and names the variable", async () => {
    await expect(pushKeyOf({ VAPID_PUBLIC_KEY: OFF_THE_CURVE })).rejects.toThrow(
      "VAPID_PUBLIC_KEY is not a point of the curve P-256",
    );
  });
});
