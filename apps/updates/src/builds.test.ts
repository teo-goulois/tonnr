import { describe, expect, it } from "vitest";

import { runtimeOf } from "./builds.ts";

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
