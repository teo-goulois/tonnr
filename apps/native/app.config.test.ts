import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { UPDATES_KEY_ID, UPDATES_SIGNATURE_ALGORITHM } from "@repo/config/updates";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const from = (path: string) => new URL(path, import.meta.url).pathname;

/** The app's config as a build with these settings reads it. */
async function configWith(env: Record<string, string>): Promise<ExpoConfig> {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { default: config } = await import("./app.config");
  return config({ config: {} } as ConfigContext);
}

afterEach(() => vi.unstubAllEnvs());

describe("the updates of the app's JavaScript", () => {
  it("are asked for by no build that names no address, as a development build", async () => {
    const config = await configWith({ UPDATES_URL: "" });
    expect(config.updates).toEqual({ enabled: false });
    expect(config.runtimeVersion).toBeUndefined();
  });

  it("come from the address a store build names, at each start, without waiting", async () => {
    const config = await configWith({ UPDATES_URL: "https://updates.example.org" });
    expect(config.updates).toMatchObject({
      enabled: true,
      url: "https://updates.example.org",
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    });
    // An update goes only to the binaries whose native code it was built with.
    expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("are checked against the committed certificate, with the key the publication names", async () => {
    const config = await configWith({ UPDATES_URL: "https://updates.example.org" });
    expect(config.updates?.codeSigningMetadata).toEqual({
      keyid: UPDATES_KEY_ID,
      alg: UPDATES_SIGNATURE_ALGORITHM,
    });
    const path = from(config.updates?.codeSigningCertificate ?? "missing");
    expect(existsSync(path)).toBe(true);
  });
});

describe("the build number", () => {
  it("is the one the release commands give, the same on both platforms", async () => {
    const config = await configWith({ APP_BUILD_NUMBER: "418" });
    expect(config.ios?.buildNumber).toBe("418");
    expect(config.android?.versionCode).toBe(418);
  });

  it("is 1 for a development build, and nothing that is no number", async () => {
    const config = await configWith({ APP_BUILD_NUMBER: "" });
    expect(config.ios?.buildNumber).toBe("1");
    await expect(configWith({ APP_BUILD_NUMBER: "4.18" })).rejects.toThrow(/not a build number/);
  });
});

describe("the certificate of the updates", () => {
  const pem = readFileSync(from("./certs/certificate.pem"), "utf8");
  const certificate = new X509Certificate(pem);

  it("holds an RSA key, which rsa-v1_5-sha256 signs with", () => {
    expect(certificate.publicKey.asymmetricKeyType).toBe("rsa");
  });

  it("signs code, for ten years from the day it was made", () => {
    expect(certificate.keyUsage).toContain("1.3.6.1.5.5.7.3.3");
    const years =
      (Date.parse(certificate.validTo) - Date.parse(certificate.validFrom)) /
      (365.25 * 24 * 3600 * 1000);
    expect(Math.round(years)).toBe(10);
  });

  it("is signed by its own key, as Expo's client reads one alone", () => {
    expect(certificate.issuer).toBe(certificate.subject);
    expect(certificate.verify(certificate.publicKey)).toBe(true);
  });

  it("is a part of the binary's fingerprint, so that a new one makes a runtime of its own", async () => {
    const { default: fingerprint } = (await import("./fingerprint.config.js")) as {
      default: { extraSources: { filePath: string }[] };
    };
    expect(fingerprint.extraSources.map((source) => source.filePath)).toContain(
      "certs/certificate.pem",
    );
  });
});
