import { describe, expect, it } from "vitest";

import { parseDecimal } from "./decimal";

describe("parseDecimal", () => {
  it("reads a decimal number", () => {
    expect(parseDecimal("0")).toBe(0);
    expect(parseDecimal("-26.84737")).toBe(-26.84737);
    expect(parseDecimal(" 16.0 ")).toBe(16);
    expect(parseDecimal("1e-3")).toBe(0.001);
    expect(parseDecimal(".5")).toBe(0.5);
  });

  it("reads an empty text and NaN as a missing value, not as zero", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal(" ")).toBeNaN();
    expect(parseDecimal("NaN")).toBeNaN();
  });

  it("refuses a text that is not a decimal number", () => {
    for (const text of ["0x10", "0b10", "5,039", "unavailable", "Infinity", "1.2.3", "12 m"]) {
      expect(parseDecimal(text)).toBeNull();
    }
  });
});
