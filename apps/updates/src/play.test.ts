import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assertionOf, releaseToPlay, serviceAccountOf } from "./play.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = JSON.stringify({
  type: "service_account",
  project_id: "tonnr-test",
  private_key_id: "0123",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  client_email: "release@tonnr-test.iam.gserviceaccount.com",
  token_uri: "https://oauth2.example.org/token",
});
const account = serviceAccountOf(KEY);
const NOW = new Date("2026-10-20T10:00:00.000Z");
const fromBase64url = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("the key of a service account", () => {
  it("is read from its JSON", () => {
    expect(account).toMatchObject({
      clientEmail: "release@tonnr-test.iam.gserviceaccount.com",
      tokenUri: "https://oauth2.example.org/token",
    });
  });

  it("is refused when it is none", () => {
    expect(() => serviceAccountOf("{")).toThrow(/not JSON/);
    expect(() => serviceAccountOf('{"type":"authorized_user"}')).toThrow(/not a service account/);
  });

  it("signs the token it asks for, for the Play Developer API and for an hour", () => {
    const [header, claims, signature] = assertionOf(account, NOW).split(".");
    expect(fromBase64url(header ?? "")).toEqual({ alg: "RS256", typ: "JWT" });
    expect(fromBase64url(claims ?? "")).toEqual({
      iss: "release@tonnr-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.example.org/token",
      iat: 1_792_490_400,
      exp: 1_792_494_000,
    });
    const signed = Buffer.from(`${header}.${claims}`);
    expect(verify("RSA-SHA256", signed, publicKey, Buffer.from(signature ?? "", "base64url"))).toBe(
      true,
    );
  });
});

type Asked = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** Google Play as a test stands for it: it answers each step, and fails the one it is told to. */
function standInPlay(failing?: string) {
  const asked: Asked[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    asked.push({ method, url, headers: init.headers as Record<string, string>, body: init.body });
    const step = `${method} ${new URL(url).pathname}`;
    if (failing && step.includes(failing)) return new Response("Forbidden", { status: 403 });
    if (url.startsWith("https://oauth2.example.org/")) {
      return Response.json({ access_token: "token", expires_in: 3599, token_type: "Bearer" });
    }
    if (step.endsWith("/edits")) return Response.json({ id: "edit-1" });
    if (step.endsWith("/bundles")) return Response.json({ versionCode: 418, sha256: "abc" });
    return Response.json({});
  }) as unknown as typeof fetch;
  return { asked, fetcher };
}

const release = (fetcher: typeof fetch, track = "internal") =>
  releaseToPlay({
    account,
    packageName: "app.tonnr",
    bundle: new Uint8Array([1, 2, 3]),
    track,
    name: "1.0.0 (418)",
    fetcher,
    now: NOW,
  });

describe("a build sent to Google Play", () => {
  it("goes through an edit: the bundle, its track, then the commit", async () => {
    const { asked, fetcher } = standInPlay();
    expect(await release(fetcher)).toBe(418);
    const app =
      "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.tonnr";
    expect(asked.map(({ method, url }) => `${method} ${url}`)).toEqual([
      "POST https://oauth2.example.org/token",
      `POST ${app}/edits`,
      "POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/app.tonnr/edits/edit-1/bundles?uploadType=media",
      `PUT ${app}/edits/edit-1/tracks/internal`,
      `POST ${app}/edits/edit-1:commit`,
    ]);
    const [token, , upload, track] = asked;
    const form = new URLSearchParams(String(token?.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
    expect(upload?.headers).toMatchObject({
      authorization: "Bearer token",
      "content-type": "application/octet-stream",
    });
    expect(upload?.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(JSON.parse(String(track?.body))).toEqual({
      track: "internal",
      releases: [{ name: "1.0.0 (418)", versionCodes: ["418"], status: "completed" }],
    });
  });

  it("deletes its edit when a step is refused, and says what Google answered", async () => {
    const { asked, fetcher } = standInPlay("/tracks/");
    await expect(release(fetcher)).rejects.toThrow(/put the build on the track internal: 403/);
    expect(asked.at(-1)).toMatchObject({
      method: "DELETE",
      url: "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.tonnr/edits/edit-1",
    });
  });

  it("never goes to production, which a person promotes it to", async () => {
    const { asked, fetcher } = standInPlay();
    await expect(release(fetcher, "production")).rejects.toThrow(/No script releases/);
    expect(asked).toEqual([]);
  });
});
