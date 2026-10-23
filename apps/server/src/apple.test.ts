import { generateKeyPairSync, verify } from "node:crypto";

import { appleProvider } from "@repo/auth/apple";
import { APPLE_REVOKE_URL, APPLE_TOKEN_URL, appleRevocationOf } from "@repo/auth/apple-revocation";
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

  it("takes an ID token made for an app's bundle alone, and none on an instance with no app", () => {
    const { apple } = appleProvider(settings, ["app.example://", "app.example.beta://"]);
    expect(apple?.clientId).toBe("app.example.web");
    expect(apple).toMatchObject({ audience: ["app.example", "app.example.beta"] });
    expect(apple).not.toHaveProperty("disableIdTokenSignIn");
    const { apple: webAlone } = appleProvider(settings, []);
    expect(webAlone).not.toHaveProperty("audience");
    expect(webAlone).toMatchObject({ disableIdTokenSignIn: true });
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

// What revokes an account's tokens as it is deleted reads the same settings: decision 071.
describe("revoking at Apple's", () => {
  it("asks nothing on an instance without Sign in with Apple", () => {
    expect(appleRevocationOf({})).toBeUndefined();
    expect(appleRevocationOf({ APPLE_TEAM_ID: "TEAM123456" })).toBeUndefined();
    expect(() => appleRevocationOf({ ...settings, APPLE_KEY_ID: "" })).toThrow();
  });

  it("revokes with the Services ID and a secret signed for it, which the web's tokens were given to", async () => {
    const sent: URLSearchParams[] = [];
    const send = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(APPLE_REVOKE_URL);
      sent.push(new URLSearchParams(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const apple = appleRevocationOf(settings, send);

    expect(await apple?.revoke({ refreshToken: "the-refresh", accessToken: null })).toBe("revoked");
    expect(sent[0]?.get("client_id")).toBe("app.example.web");
    expect(sent[0]?.get("token")).toBe("the-refresh");
    const secret = read(sent[0]?.get("client_secret") ?? "");
    expect(secret.signed).toBe(true);
    expect(secret.payload).toMatchObject({ iss: "TEAM123456", sub: "app.example.web" });
  });

  // An ID token as Apple's answer to an exchange holds one: its signature is not read.
  const idToken = (sub: string) =>
    ["e30", Buffer.from(JSON.stringify({ sub })).toString("base64url"), "c2ln"].join(".");
  const apple = (answers: { token: Response | "down"; revoke?: Response }) => {
    const sent: { url: string; body: URLSearchParams }[] = [];
    const send = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: new URLSearchParams(String(init?.body)) });
      if (String(url) === APPLE_TOKEN_URL) {
        if (answers.token === "down") throw new TypeError("fetch failed");
        return answers.token;
      }
      return answers.revoke ?? new Response(null, { status: 200 });
    }) as typeof fetch;
    return { revocation: appleRevocationOf(settings, send)!, sent };
  };
  const tokens = (sub: string) =>
    Response.json({
      access_token: "the-access",
      refresh_token: "the-refresh",
      id_token: idToken(sub),
    });
  const app = { bundle: "app.example", appleUsers: ["apple-sub"] };

  it("exchanges an app's code for its bundle, with a secret signed for it, then revokes the refresh token it got", async () => {
    const { revocation, sent } = apple({ token: tokens("apple-sub") });

    expect(await revocation.revokeCode("the-code", app)).toEqual({ outcome: "revoked" });
    expect(sent.map((one) => one.url)).toEqual([APPLE_TOKEN_URL, APPLE_REVOKE_URL]);
    const [exchange, revoke] = sent;
    expect(exchange?.body.get("client_id")).toBe("app.example");
    expect(exchange?.body.get("code")).toBe("the-code");
    expect(exchange?.body.get("grant_type")).toBe("authorization_code");
    const secret = read(exchange?.body.get("client_secret") ?? "");
    expect(secret.signed).toBe(true);
    expect(secret.payload).toMatchObject({
      iss: "TEAM123456",
      sub: "app.example",
      aud: "https://appleid.apple.com",
    });
    expect(secret.header).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(Object.fromEntries(revoke?.body ?? [])).toEqual({
      client_id: "app.example",
      client_secret: exchange?.body.get("client_secret"),
      token: "the-refresh",
      token_type_hint: "refresh_token",
    });
  });

  it("revokes nothing for another Apple account, and says what failed without throwing", async () => {
    const another = apple({ token: tokens("someone-else") });
    expect(await another.revocation.revokeCode("the-code", app)).toEqual({ outcome: "another" });
    expect(another.sent).toHaveLength(1);

    const refused = apple({
      token: Response.json(
        { error: "invalid_grant", error_description: "it said more" },
        { status: 400 },
      ),
    });
    expect(await refused.revocation.revokeCode("old-code", app)).toEqual({
      outcome: "failed",
      at: "exchange",
      said: "400 invalid_grant",
    });
    const down = apple({ token: "down" });
    expect(await down.revocation.revokeCode("the-code", app)).toEqual({
      outcome: "failed",
      at: "exchange",
      said: "no answer",
    });
    const kept = apple({
      token: tokens("apple-sub"),
      revoke: new Response("{}", { status: 503 }),
    });
    expect(await kept.revocation.revokeCode("the-code", app)).toEqual({
      outcome: "failed",
      at: "revoke",
      said: "503",
    });
  });
});
