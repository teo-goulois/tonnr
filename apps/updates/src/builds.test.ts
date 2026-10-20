import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readShipped } from "./bucket.ts";
import {
  buildNumberOf,
  exportOptionsOf,
  runtimeDrift,
  runtimeOf,
  shippedOf,
  workspaceOf,
} from "./builds.ts";

const RUNTIME = "7c9fb63bbd086fc57d43655a2ed404265802a980";

describe("the runtime expo-updates names", () => {
  it("is the fingerprint it prints on its last line", () => {
    const printed = JSON.stringify({
      runtimeVersion: RUNTIME,
      fingerprintSources: [],
      workflow: "managed",
    });
    expect(runtimeOf(`a config plugin said something\n${printed}\n`)).toBe(RUNTIME);
  });

  it("is refused when it is no fingerprint, as when the config names no address of updates", () => {
    expect(() => runtimeOf(JSON.stringify({ runtimeVersion: null }))).toThrow(/no fingerprint/);
    expect(() => runtimeOf(JSON.stringify({ runtimeVersion: "1.0.0" }))).toThrow(/no fingerprint/);
  });

  it("is refused when it printed something else", () => {
    expect(() => runtimeOf("Error: no app.config")).toThrow(/named no runtime/);
  });
});

describe("the build number", () => {
  const repository = mkdtempSync(join(tmpdir(), "build-number-"));
  afterAll(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: repository,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.org",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.org",
      },
    });

  it("is the count of commits up to the one built, which grows with main", () => {
    git("init", "--quiet", "--initial-branch=main");
    for (const message of ["one", "two", "three"]) {
      git("commit", "--quiet", "--allow-empty", "--no-gpg-sign", "-m", message);
    }
    expect(buildNumberOf(git("rev-list", "--count", "HEAD"))).toBe(3);
    expect(buildNumberOf(git("rev-list", "--count", "HEAD~1"))).toBe(2);
  });

  it("is refused when it is none a store takes", () => {
    expect(() => buildNumberOf("0\n")).toThrow(/no build number/);
    expect(() => buildNumberOf("fatal: bad revision")).toThrow(/no build number/);
    expect(() => buildNumberOf("2100000001")).toThrow(/no build number/);
  });
});

describe("the runtime a store build carries", () => {
  it("goes out when it is the one a publication of its commit would name", () => {
    expect(runtimeDrift("ios", `${RUNTIME}\n`, RUNTIME)).toBeNull();
  });

  it("stops the build when it drifted, before anything is uploaded", () => {
    const drift = runtimeDrift("android", "60d00987712d6cb92aac76cbe480f2cd8d739fb9", RUNTIME);
    expect(drift).toContain("The android binary carries the runtime 60d00987");
    expect(drift).toContain(`would name ${RUNTIME}`);
    expect(runtimeDrift("ios", "", RUNTIME)).toContain("carries the runtime (none)");
  });

  it("is written in the bucket as the Worker's side reads it", () => {
    const shipped = {
      build: 418,
      commit: "a".repeat(40),
      version: "1.0.0",
      shippedAt: "2026-10-20T10:00:00.000Z",
    };
    expect(readShipped(new TextDecoder().decode(shippedOf(shipped)))).toEqual(shipped);
    expect(readShipped('{"build":"418"}')).toBeNull();
  });
});

describe("what xcodebuild is given", () => {
  it("exports for App Store Connect, signed by the team, keeping the build number", () => {
    const plist = exportOptionsOf("A1B2C3D4E5");
    expect(plist).toContain("<key>method</key>\n  <string>app-store-connect</string>");
    expect(plist).toContain("<key>teamID</key>\n  <string>A1B2C3D4E5</string>");
    expect(plist).toContain("<key>manageAppVersionAndBuildNumber</key>\n  <false/>");
  });

  it("builds the workspace expo prebuild wrote, and no other", () => {
    expect(workspaceOf(["Podfile", "Tonnr.xcodeproj", "Tonnr.xcworkspace", "Pods"])).toBe("Tonnr");
    expect(() => workspaceOf(["Tonnr.xcodeproj"])).toThrow(/0 workspaces/);
  });
});
