import { X509Certificate, createHash, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  convertCertificateToCertificatePEM,
  convertKeyPairToPEM,
  generateKeyPair,
  generateSelfSignedCodeSigningCertificate,
} from "@expo/code-signing-certificates";
import { afterAll, describe, expect, it } from "vitest";

import { NO_UPDATE_KEY, latestKey, signedKey } from "./bucket.ts";
import {
  type Exported,
  type ManifestInput,
  FILE_CACHE,
  inOrder,
  keyMatchesCertificate,
  manifestOf,
  newUpdateId,
  readExport,
  rollbackWrites,
  signatureOf,
  updateWrites,
  writeAll,
} from "./publish.ts";
import { r2Client } from "./r2.ts";
import { partName, readMultipart, signatureOf as signatureIn, standInBucket } from "./testing.ts";
import worker from "./worker.ts";

/** A key and its certificate, made as `npx expo-updates codesigning:generate` makes them. */
function codeSigning() {
  const keyPair = generateKeyPair();
  const now = new Date();
  const later = new Date(now);
  later.setFullYear(now.getFullYear() + 10);
  const certificate = generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: now,
    validityNotAfter: later,
    commonName: "test",
  });
  return {
    privateKey: convertKeyPairToPEM(keyPair).privateKeyPEM,
    certificate: convertCertificateToCertificatePEM(certificate),
  };
}

const signing = codeSigning();
const other = codeSigning();
const RUNTIME = "0123456789abcdef0123456789abcdef01234567";
const COMMIT = "a".repeat(40);
const encode = (text: string) => new TextEncoder().encode(text);
const sha256 = (bytes: Uint8Array, encoding: "hex" | "base64url") =>
  createHash("sha256").update(bytes).digest(encoding);

/** An export of the app, much smaller than one: a bundle, a picture and a font both share. */
const exportOf = (platform: string): Exported => ({
  bundle: encode(`bytecode of ${platform}`),
  assets: [
    { ext: "png", bytes: encode("a picture") },
    { ext: "ttf", bytes: encode("Geist") },
  ],
});
const inputOf = (platform: string, overrides: Partial<ManifestInput> = {}): ManifestInput => ({
  id: newUpdateId(),
  createdAt: "2026-10-20T10:00:00.000Z",
  runtime: RUNTIME,
  exported: exportOf(platform),
  filesOrigin: "https://bundles.example.org",
  expoClient: { name: "Tonnr", slug: "tonnr", scheme: "app.tonnr" },
  commit: COMMIT,
  ...overrides,
});

describe("the manifest of an update", () => {
  it("names each file by the hash the client checks, at the bucket's domain", () => {
    const input = inputOf("ios");
    const { manifest, files } = manifestOf(input);
    const bundle = input.exported.bundle;
    expect(manifest).toMatchObject({
      id: input.id,
      createdAt: input.createdAt,
      runtimeVersion: RUNTIME,
      metadata: {},
      extra: { expoClient: input.expoClient, commit: COMMIT },
    });
    expect(manifest.launchAsset).toEqual({
      hash: sha256(bundle, "base64url"),
      key: sha256(bundle, "hex"),
      contentType: "application/javascript",
      fileExtension: ".bundle",
      url: `https://bundles.example.org/files/${sha256(bundle, "hex")}`,
    });
    expect(manifest.assets.map((asset) => [asset.contentType, asset.fileExtension])).toEqual([
      ["image/png", ".png"],
      ["font/ttf", ".ttf"],
    ]);
    // A key goes into a file name on the phone: no separator, no padding.
    for (const asset of [manifest.launchAsset, ...manifest.assets]) {
      expect(asset.key).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.hash).not.toMatch(/[=+/]/);
    }
    expect(files.every((file) => file.cacheControl === FILE_CACHE && file.immutable)).toBe(true);
  });

  it("is signed so that the certificate of the binaries checks it", () => {
    const body = encode(JSON.stringify(manifestOf(inputOf("ios")).manifest));
    const header = signatureOf(body, signing.privateKey);
    expect(header).toMatch(/^sig="[^"]+", keyid="main", alg="rsa-v1_5-sha256"$/);
    const sig = Buffer.from(/sig="([^"]+)"/.exec(header)?.[1] ?? "", "base64");
    const key = new X509Certificate(signing.certificate).publicKey;
    expect(verify("RSA-SHA256", body, key, sig)).toBe(true);
    expect(verify("RSA-SHA256", encode("another body"), key, sig)).toBe(false);
  });

  it("is signed by no key but the certificate's", () => {
    expect(keyMatchesCertificate(signing.privateKey, signing.certificate)).toBe(true);
    expect(keyMatchesCertificate(other.privateKey, signing.certificate)).toBe(false);
  });
});

describe("the order of a publication", () => {
  it("writes the files of every platform, then each manifest, then what points at it", () => {
    const writes = inOrder([
      updateWrites("ios", inputOf("ios"), signing.privateKey).writes,
      updateWrites("android", inputOf("android"), signing.privateKey).writes,
    ]);
    const kinds = writes.map(({ key }) => key.split("/")[0]);
    // A bundle each, and the picture and the font once for both.
    expect(kinds).toEqual([
      "files",
      "files",
      "files",
      "files",
      "updates",
      "directives",
      "runtimes",
      "updates",
      "runtimes",
    ]);
    expect(writes.at(-1)?.key).toBe(latestKey("android", RUNTIME));
  });
});

describe("a publication, from the bucket to an app", () => {
  const bucket = standInBucket();
  const client = r2Client(
    {
      accountId: "0123456789abcdef0123456789abcdef",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "tonnr-test-updates",
    },
    bucket.s3,
  );
  const ask = (platform: string, current: string) =>
    worker.fetch(
      new Request("https://updates.example.org/", {
        headers: {
          "expo-platform": platform,
          "expo-protocol-version": "1",
          "expo-runtime-version": RUNTIME,
          "expo-current-update-id": current,
          "expo-embedded-update-id": "1d6a2c4e-0b9e-4f0a-8a8d-3e5b7c9d1e2f",
        },
      }),
      { BUCKET: bucket.binding },
    );
  /** The part of an answer, once the binary has checked its signature with its certificate. */
  const checked = async (response: Response) => {
    const [part] = readMultipart(
      new Uint8Array(await response.arrayBuffer()),
      response.headers.get("content-type") ?? "",
    );
    if (!part) throw new Error("No part");
    const { sig, keyid } = signatureIn(part);
    expect(keyid).toBe("main");
    const key = new X509Certificate(signing.certificate).publicKey;
    expect(verify("RSA-SHA256", part.body, key, Buffer.from(sig, "base64"))).toBe(true);
    return { name: partName(part), json: JSON.parse(new TextDecoder().decode(part.body)) };
  };

  const ios = inputOf("ios");
  const android = inputOf("android");

  it("gives each platform its manifest, whose files the bucket's domain serves", async () => {
    const written = await writeAll(
      client,
      inOrder([
        updateWrites("ios", ios, signing.privateKey).writes,
        updateWrites("android", android, signing.privateKey).writes,
      ]),
    );
    expect(written).toEqual({ sent: 9, kept: 0 });
    // Every file was there before a manifest named it, and the manifest before its pointer.
    const puts = bucket.calls
      .filter((call) => call.startsWith("PUT "))
      .map((call) => call.slice("PUT ".length));
    const lastFile = Math.max(...puts.map((key, at) => (key.startsWith("files/") ? at : -1)));
    expect(lastFile).toBeLessThan(puts.findIndex((key) => key.startsWith("updates/")));
    expect(puts.indexOf(latestKey("ios", RUNTIME))).toBeGreaterThan(
      puts.indexOf(signedKey("ios", RUNTIME, ios.id)),
    );

    const { name, json } = await checked(await ask("ios", "null"));
    expect(name).toBe("manifest");
    expect(json.id).toBe(ios.id);
    for (const asset of [json.launchAsset, ...json.assets]) {
      const response = await bucket.files(asset.url);
      expect(response.headers.get("content-type")).toBe(asset.contentType);
      expect(response.headers.get("cache-control")).toBe(FILE_CACHE);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(sha256(bytes, "base64url")).toBe(asset.hash);
    }
    expect((await checked(await ask("android", "null"))).json.id).toBe(android.id);
  });

  it("tells an app that runs it that nothing is new, in the directive signed once", async () => {
    expect(await checked(await ask("ios", ios.id))).toEqual({
      name: "directive",
      json: { type: "noUpdateAvailable" },
    });
    expect(bucket.objects.get(NO_UPDATE_KEY)?.metadata.signature).toBe(
      signatureOf(encode('{"type":"noUpdateAvailable"}'), signing.privateKey),
    );
  });

  it("sends no file again that the bucket holds already", async () => {
    const next = inputOf("ios", { createdAt: "2026-10-21T10:00:00.000Z" });
    const writes = updateWrites("ios", next, signing.privateKey).writes;
    expect(await writeAll(client, writes)).toEqual({ sent: 3, kept: 3 });
    expect((await checked(await ask("ios", ios.id))).json.id).toBe(next.id);
  });

  it("sends a runtime's apps back to their binary's JavaScript after a rollback", async () => {
    const id = newUpdateId();
    await writeAll(
      client,
      rollbackWrites("ios", RUNTIME, id, "2026-10-22T10:00:00.000Z", signing.privateKey),
    );
    expect(await checked(await ask("ios", ios.id))).toEqual({
      name: "directive",
      json: { type: "rollBackToEmbedded", parameters: { commitTime: "2026-10-22T10:00:00.000Z" } },
    });
    // Android's apps keep their update.
    expect((await checked(await ask("android", "null"))).json.id).toBe(android.id);
  });
});

describe("an export of the app", () => {
  const directory = mkdtempSync(join(tmpdir(), "updates-export-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("is read as expo export describes it in metadata.json", () => {
    mkdirSync(join(directory, "_expo/static/js/ios"), { recursive: true });
    mkdirSync(join(directory, "assets"));
    writeFileSync(join(directory, "_expo/static/js/ios/entry-abc.hbc"), "bytecode");
    writeFileSync(join(directory, "assets/0123"), "a picture");
    writeFileSync(
      join(directory, "metadata.json"),
      JSON.stringify({
        version: 0,
        bundler: "metro",
        fileMetadata: {
          ios: {
            bundle: "_expo/static/js/ios/entry-abc.hbc",
            assets: [{ path: "assets/0123", ext: "png" }],
          },
        },
      }),
    );
    expect(readExport(directory, "ios")).toEqual({
      bundle: encode("bytecode"),
      assets: [{ ext: "png", bytes: encode("a picture") }],
    });
    expect(() => readExport(directory, "android")).toThrow(/nothing for android/);
  });
});
