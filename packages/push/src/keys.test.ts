import { describe, expect, it } from "vitest";

import { makeVapidKeys, readVapidKeys } from "./keys";
import { readVapid } from "./testing";
import { vapidHeader } from "./vapid";

describe("the pair of keys of an instance", () => {
  // The shapes the instance's settings take at startup: a whole point of the curve and a number
  // of 32 bytes, in base64url with no padding.
  const PUBLIC = /^B[A-Za-z0-9_-]{85}[AEIMQUYcgkosw048]$/;
  const PRIVATE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

  it("is made in the shape the settings take, every time", () => {
    // A number that begins with a zero byte comes about once in 256: it keeps its length.
    for (let made = 0; made < 2000; made += 1) {
      const keys = makeVapidKeys();
      expect(keys.publicKey).toMatch(PUBLIC);
      expect(keys.privateKey).toMatch(PRIVATE);
    }
  });

  it("is read back as a pair, and is another each time it is made", () => {
    const keys = makeVapidKeys();

    expect(readVapidKeys(keys.publicKey, keys.privateKey).publicKey).toBe(keys.publicKey);
    expect(makeVapidKeys().privateKey).not.toBe(keys.privateKey);
  });

  it("is refused when it is not a pair, in words that hold no key", () => {
    const keys = makeVapidKeys();
    const other = makeVapidKeys();

    for (const [publicKey, privateKey, said] of [
      [other.publicKey, keys.privateKey, "is not the public key of VAPID_PRIVATE_KEY"],
      [keys.privateKey, keys.privateKey, "VAPID_PUBLIC_KEY is not a public key"],
      [`${keys.publicKey}=`, keys.privateKey, "VAPID_PUBLIC_KEY is not a public key"],
      [keys.publicKey, keys.publicKey, "VAPID_PRIVATE_KEY is not a private key"],
      [keys.publicKey, "", "VAPID_PRIVATE_KEY is not a private key"],
      // Thirty-two bytes that are no number of the curve.
      [keys.publicKey, Buffer.alloc(32).toString("base64url"), "VAPID_PRIVATE_KEY is not"],
      [keys.publicKey, Buffer.alloc(32, 255).toString("base64url"), "VAPID_PRIVATE_KEY is not"],
    ] as const) {
      let message = "";
      try {
        readVapidKeys(publicKey, privateKey);
      } catch (error) {
        message = String(error);
      }
      expect(message, said).toContain(said);
      expect(message).not.toContain(keys.privateKey);
      expect(message).not.toContain(other.publicKey);
    }
  });
});

describe("the header a push is signed with", () => {
  const made = makeVapidKeys();
  const keys = readVapidKeys(made.publicKey, made.privateKey);
  const now = new Date("2026-10-12T08:00:00Z");

  it("names the push service, the instance and its public key, for half a day", () => {
    const header = vapidHeader(keys, "https://fcm.googleapis.com", "https://app.example.org", now);

    const read = readVapid(header);
    expect(read).toMatchObject({
      publicKey: made.publicKey,
      header: { typ: "JWT", alg: "ES256" },
      claims: {
        aud: "https://fcm.googleapis.com",
        sub: "https://app.example.org",
        exp: now.getTime() / 1000 + 12 * 60 * 60,
      },
      isSigned: true,
    });
  });

  it("is not one another pair of keys signed, nor one that was changed", () => {
    const header = vapidHeader(keys, "https://fcm.googleapis.com", "https://app.example.org", now);
    const other = makeVapidKeys();

    // The same token, said to be of another key.
    expect(readVapid(header.replace(made.publicKey, other.publicKey))?.isSigned).toBe(false);
    // Another push service than the one it was signed for.
    const [, token = ""] = /t=([^,]+),/.exec(header) ?? [];
    const [head = "", , signature = ""] = token.split(".");
    const claims = Buffer.from(
      JSON.stringify({ aud: "https://push.example.org", exp: 1, sub: "https://app.example.org" }),
    ).toString("base64url");
    expect(readVapid(`vapid t=${head}.${claims}.${signature}, k=${made.publicKey}`)?.isSigned).toBe(
      false,
    );
  });
});
