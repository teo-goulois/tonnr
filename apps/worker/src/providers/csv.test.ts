import { describe, expect, it } from "vitest";

import { fieldNumber, parseCsvLine } from "./csv";

describe("parseCsvLine", () => {
  it("splits on commas and trims each field", () => {
    expect(parseCsvLine("Caloundra, 54 ,0.807,")).toEqual(["Caloundra", "54", "0.807", ""]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsvLine('"Mackay, inner",4740htx')).toEqual(["Mackay, inner", "4740htx"]);
  });

  it("reads two double quotes inside a quoted field as one", () => {
    expect(parseCsvLine('"The ""Barrels"" buoy",1')).toEqual(['The "Barrels" buoy', "1"]);
  });
});

describe("fieldNumber", () => {
  it("reads an empty field as missing, not as zero", () => {
    expect(fieldNumber("")).toBeNaN();
    expect(fieldNumber("0")).toBe(0);
    expect(fieldNumber("-26.84737")).toBe(-26.84737);
  });
});
