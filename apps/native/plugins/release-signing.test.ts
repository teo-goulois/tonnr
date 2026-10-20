import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import withReleaseSigning from "./release-signing.js";

const { withUploadKey, UPLOAD_KEY } = withReleaseSigning as unknown as {
  withUploadKey: (gradle: string) => string;
  UPLOAD_KEY: Record<string, string>;
};

/** A file of the template `expo prebuild` writes android/ from, as the installed SDK ships it. */
function templateFile(name: string): string {
  const expo = dirname(createRequire(import.meta.url).resolve("expo/package.json"));
  const tar = gunzipSync(readFileSync(join(expo, "template.tgz")));
  for (let at = 0; at + 512 <= tar.length;) {
    const path = tar
      .subarray(at, at + 100)
      .toString("utf8")
      .replace(/\0.*$/s, "");
    if (!path) break;
    const size = Number.parseInt(
      tar
        .subarray(at + 124, at + 136)
        .toString("utf8")
        .trim(),
      8,
    );
    if (path === name) return tar.subarray(at + 512, at + 512 + size).toString("utf8");
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`The template holds no ${name}`);
}

const template = templateFile("package/android/app/build.gradle");
const signed = withUploadKey(template);

describe("the signing of an Android release", () => {
  it("reads the upload key from Gradle's environment, and writes none of it", () => {
    for (const name of Object.values(UPLOAD_KEY)) {
      expect(signed).toContain(`System.getenv("${name}")`);
    }
    const release = /signingConfigs\s*\{\s*release\s*\{[\s\S]*?\n {8}\}/.exec(signed)?.[0];
    expect(release).toContain('storeFile file(System.getenv("ANDROID_UPLOAD_KEYSTORE"))');
  });

  it("signs the release with it, and a release without it with the debug key as before", () => {
    const buildTypes = signed.slice(signed.indexOf("buildTypes"));
    const release = buildTypes.slice(buildTypes.indexOf("release {"));
    expect(release).toMatch(
      /^release \{[^}]*signingConfig System\.getenv\("ANDROID_UPLOAD_KEYSTORE"\) \? signingConfigs\.release : signingConfigs\.debug/,
    );
    // The debug build keeps the debug key.
    expect(buildTypes.slice(0, buildTypes.indexOf("release {"))).toContain(
      "signingConfig signingConfigs.debug",
    );
  });

  it("changes nothing the second time", () => {
    expect(withUploadKey(signed)).toBe(signed);
  });

  it("refuses a build.gradle it does not know, rather than build with the debug key", () => {
    expect(() => withUploadKey("android {\n}\n")).toThrow(/no signing of its release/);
  });
});
