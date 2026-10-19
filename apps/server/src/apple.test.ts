import { generateKeyPairSync, verify } from "node:crypto";

import { appleProvider } from "@repo/auth/apple";
import { describe, expect, it } from "vitest";

// A key made for the test, of the kind Apple gives: P-256, in a .p8 file's PEM.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const P8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const settings = {
  APPLE_SERVICES_ID: "app.example.web",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: P8,
};
const APPS = ["app.example://"];

function read(token: string) {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  const json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());
  const signed = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url"),
  );
  return { header: json(header), payload: json(payload), signed };
}

describe("Sign in with Apple's settings", () => {
  it("leaves an instance without them on the other ways in, a team alone included", () => {
    expect(appleProvider({}, APPS)).toEqual({});
    expect(appleProvider({ APPLE_SERVICES_ID: "", APPLE_PRIVATE_KEY: " " }, APPS)).toEqual({});
    expect(appleProvider({ APPLE_TEAM_ID: "TEAM123456" }, APPS)).toEqual({});
  });

  it("refuses some of them without the others, or without the team, and prints no value", () => {
    const refusal =
      "APPLE_SERVICES_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY must be set together, with APPLE_TEAM_ID";
    expect(() => appleProvider({ ...settings, APPLE_KEY_ID: "" }, APPS)).toThrow(refusal);
    expect(() => appleProvider({ APPLE_PRIVATE_KEY: P8 }, APPS)).toThrow(refusal);
    expect(() => appleProvider({ ...settings, APPLE_TEAM_ID: undefined }, APPS)).toThrow(refusal);
  });

  it("refuses what is not a key of Apple's, without printing it", () => {
    let message = "";
    try {
      appleProvider({ ...settings, APPLE_PRIVATE_KEY: "made-up-not-a-key" }, APPS);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("APPLE_PRIVATE_KEY must be the content of the key's .p8 file");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(() => appleProvider({ ...settings, APPLE_PRIVATE_KEY: rsa }, APPS)).toThrow(
      "APPLE_PRIVATE_KEY must be a key of Apple's, on the curve P-256",
    );
  });

  it("reads a key whose lines a settings file wrote on one line", () => {
    const oneLine = P8.trim().replaceAll("\n", "\\n");
    const { apple } = appleProvider({ ...settings, APPLE_PRIVATE_KEY: oneLine }, APPS);
    expect(read(apple!.clientSecret).signed).toBe(true);
  });

  it("takes an ID token made for the web's Services ID or for an app's bundle", () => {
    const { apple } = appleProvider(settings, ["app.example://", "app.example.beta://"]);
    expect(apple?.clientId).toBe("app.example.web");
    expect(apple?.audience).toEqual(["app.example.web", "app.example", "app.example.beta"]);
  });

  it("signs the client's secret Apple asks for, with the key, for less than six months", () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const { apple } = appleProvider(settings, APPS, () => now);
    const { header, payload, signed } = read(apple!.clientSecret);
    expect(signed).toBe(true);
    expect(header).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(payload).toEqual({
      iss: "TEAM123456",
      iat: now / 1000,
      exp: now / 1000 + 24 * 60 * 60,
      aud: "https://appleid.apple.com",
      sub: "app.example.web",
    });
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15_777_000);
  });

  it("signs it again before it runs out, and keeps it until then", () => {
    let now = Date.UTC(2026, 9, 19, 12);
    const { apple } = appleProvider(settings, APPS, () => now);
    const first = apple!.clientSecret;
    now += 22 * 60 * 60 * 1000;
    expect(apple!.clientSecret).toBe(first);
    now += 2 * 60 * 60 * 1000;
    const second = apple!.clientSecret;
    expect(second).not.toBe(first);
    expect(read(second).payload.iat).toBe(now / 1000);
    expect(read(second).payload.exp).toBeGreaterThan(now / 1000);
  });
});
