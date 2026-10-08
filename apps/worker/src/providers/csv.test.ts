import { describe, expect, it } from "vitest";

import { fieldNumber, parseCsv, parseCsvLine } from "./csv";

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

  it("refuses a line with a quote left open", () => {
    expect(parseCsvLine('"Mackay, inner,4740htx')).toBeNull();
    expect(parseCsvLine('Barrels AIS,16.0"')).toBeNull();
  });
});

describe("parseCsv", () => {
  it("splits a text into its lines of fields, whatever the line breaks", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("leaves out empty lines and a byte order mark", () => {
    expect(parseCsv("\uFEFFa,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("marks a last line with no line break after it, as in a file cut short", () => {
    expect(parseCsv("a,b\n1,2\n3,0.")).toEqual([["a", "b"], ["1", "2"], null]);
  });

  it("marks a line with a quote left open", () => {
    expect(parseCsv('a,b\n"1,2\n3,4\n')).toEqual([["a", "b"], null, ["3", "4"]]);
  });

  it("reads an empty text as no lines", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("fieldNumber", () => {
  it("reads an empty field as missing, not as zero", () => {
    expect(fieldNumber("")).toBeNaN();
    expect(fieldNumber("0")).toBe(0);
    expect(fieldNumber("-26.84737")).toBe(-26.84737);
  });
});
