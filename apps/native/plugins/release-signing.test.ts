import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import withReleaseSigning from "./release-signing.js";
import uploadKey from "./upload-key.js";

const { withUploadKey } = withReleaseSigning as unknown as {
  withUploadKey: (gradle: string) => string;
};
const { UPLOAD_KEY_PROPERTY, UPLOAD_KEY_FIELDS, uploadKeyProperties } = uploadKey as unknown as {
  UPLOAD_KEY_PROPERTY: string;
  UPLOAD_KEY_FIELDS: string[];
  uploadKeyProperties: (key: Record<string, string>) => string;
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
  it("reads the upload key from the file a property of Gradle names, and writes none of it", () => {
    const release = /signingConfigs\s*\{\s*release\s*\{[\s\S]*?\n {8}\}/.exec(signed)?.[0];
    expect(release).toContain(`file(project.property("${UPLOAD_KEY_PROPERTY}"))`);
    for (const field of UPLOAD_KEY_FIELDS) {
      expect(release).toContain(`${field} `);
      expect(release).toContain(`uploadKey.getProperty("${field}")`);
    }
    // Gradle's environment, which the tools of the build inherit, holds none of it.
    expect(signed).not.toContain("System.getenv");
  });

  it("signs the release with it, and a release without it with the debug key as before", () => {
    const buildTypes = signed.slice(signed.indexOf("buildTypes"));
    const release = buildTypes.slice(buildTypes.indexOf("release {"));
    expect(release).toMatch(
      /^release \{[^}]*signingConfig project\.hasProperty\("uploadKeyFile"\) \? signingConfigs\.release : signingConfigs\.debug/,
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

describe("the file of the upload key", () => {
  const key = {
    storeFile: "/Users/someone/.config/app/upload.jks",
    storePassword: "plain",
    keyAlias: "upload",
    keyPassword: "plain",
  };

  it("holds the four parts Android's signing names, one a line", () => {
    expect(uploadKeyProperties(key)).toBe(
      "storeFile=/Users/someone/.config/app/upload.jks\n" +
        "storePassword=plain\nkeyAlias=upload\nkeyPassword=plain\n",
    );
  });

  it("escapes what java.util.Properties would read otherwise, in ASCII alone", () => {
    const written = uploadKeyProperties({
      ...key,
      storePassword: String.raw` a\b=c:d#e!f` + "\tg\nh",
      keyPassword: "été😀",
    });
    expect(written).toContain(String.raw`storePassword=\ a\\b\=c\:d\#e\!f\tg\nh` + "\n");
    expect(written).toContain(String.raw`keyPassword=\u00e9t\u00e9\ud83d\ude00` + "\n");
    expect(/^[\x20-\x7e\n]*$/.test(written)).toBe(true);
  });

  it("refuses a key that misses a part", () => {
    expect(() => uploadKeyProperties({ ...key, keyPassword: "" })).toThrow(/no keyPassword/);
  });
});
