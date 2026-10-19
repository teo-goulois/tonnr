import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { dark, light, radius } from "./tokens";

const script = fileURLToPath(
  new URL("../../../../packages/ui/scripts/native-theme.mjs", import.meta.url),
);

describe("the app's theme", () => {
  it("is the web's, as globals.css says it today", () => {
    expect(() =>
      execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("has every color in dark that it has in light, and the web's radii", () => {
    expect(Object.keys(dark)).toEqual(Object.keys(light));
    expect(radius).toEqual({ xs: 18, s: 28, m: 42, l: 50, xl: 36 });
  });
});
