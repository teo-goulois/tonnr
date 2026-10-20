import { verify } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { latestKey, signedKey } from "./bucket.ts";
import {
  partName,
  putSigned,
  readMultipart,
  signatureOf,
  standInBucket,
  testKeys,
} from "./testing.ts";
import worker from "./worker.ts";

const RUNTIME = "0123456789abcdef0123456789abcdef01234567";
const UPDATE = "8b0f0f7e-4f2e-4c47-9b51-6a1e3c2d1f00";
const EMBEDDED = "1d6a2c4e-0b9e-4f0a-8a8d-3e5b7c9d1e2f";
const keys = testKeys();

/** A bucket where an update was published for iOS, as `pnpm run release:js` leaves it. */
function published() {
  const bucket = standInBucket();
  putSigned(
    bucket,
    signedKey("ios", RUNTIME, UPDATE),
    JSON.stringify({ id: UPDATE, runtimeVersion: RUNTIME, name: "Hossegor — été" }),
    keys.privateKey,
  );
  bucket.put(latestKey("ios", RUNTIME), JSON.stringify({ kind: "update", id: UPDATE }));
  return bucket;
}

/** What an app sends at its start, as expo-updates writes its headers. */
const ask = (bucket: ReturnType<typeof standInBucket>, headers: Record<string, string> = {}) =>
  worker.fetch(
    new Request("https://updates.example.org/", {
      headers: {
        accept: "multipart/mixed,application/expo+json,application/json",
        "expo-platform": "ios",
        "expo-protocol-version": "1",
        "expo-api-version": "1",
        "expo-runtime-version": RUNTIME,
        "expo-embedded-update-id": EMBEDDED,
        "expo-current-update-id": EMBEDDED,
        "eas-client-id": "c0ffee00-0000-4000-8000-000000000000",
        ...headers,
      },
    }),
    { BUCKET: bucket.binding },
  );

/** The one part of an answer, its signature checked as the binary checks it. */
async function partOf(response: Response) {
  const parts = readMultipart(
    new Uint8Array(await response.arrayBuffer()),
    response.headers.get("content-type") ?? "",
  );
  expect(parts).toHaveLength(1);
  const [part] = parts;
  if (!part) throw new Error("No part");
  const { sig, keyid } = signatureOf(part);
  expect(keyid).toBe("main");
  expect(verify("RSA-SHA256", part.body, keys.publicKey, Buffer.from(sig, "base64"))).toBe(true);
  return { name: partName(part), json: JSON.parse(new TextDecoder().decode(part.body)) };
}

afterEach(() => vi.restoreAllMocks());

describe("the Worker of updates, over its bucket", () => {
  it("gives an app the manifest of the update its runtime has, signed", async () => {
    const response = await ask(published());
    expect(response.status).toBe(200);
    expect(await partOf(response)).toEqual({
      name: "manifest",
      json: { id: UPDATE, runtimeVersion: RUNTIME, name: "Hossegor — été" },
    });
  });

  it("tells an app that runs it that nothing is new, with a 204 that no key signs", async () => {
    const response = await ask(published(), { "expo-current-update-id": UPDATE });
    expect(response.status).toBe(204);
    expect(response.headers.get("expo-protocol-version")).toBe("1");
  });

  it("tells the apps of another runtime that nothing is new", async () => {
    const response = await ask(published(), {
      "expo-runtime-version": "fedcba9876543210fedcba9876543210fedcba98",
    });
    expect(response.status).toBe(204);
  });

  it("sends the apps back to their binary's JavaScript after a rollback", async () => {
    const bucket = published();
    const back = "5e6f7a8b-0000-4000-8000-000000000000";
    putSigned(
      bucket,
      signedKey("ios", RUNTIME, back),
      JSON.stringify({ type: "rollBackToEmbedded", parameters: { commitTime: "2026-10-20" } }),
      keys.privateKey,
    );
    bucket.put(latestKey("ios", RUNTIME), JSON.stringify({ kind: "rollBackToEmbedded", id: back }));
    expect(await partOf(await ask(bucket, { "expo-current-update-id": UPDATE }))).toMatchObject({
      name: "directive",
      json: { type: "rollBackToEmbedded" },
    });
    // An app that runs its binary's JavaScript already has nothing to go back to.
    expect((await ask(bucket)).status).toBe(204);
  });

  it("reads its bucket, writes nothing in it and logs nothing", async () => {
    const logged = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const bucket = published();
    await ask(bucket);
    await ask(bucket, { "expo-platform": "web" });
    expect(bucket.calls.every((call) => call.startsWith("get "))).toBe(true);
    for (const spy of logged) expect(spy).not.toHaveBeenCalled();
  });
});
