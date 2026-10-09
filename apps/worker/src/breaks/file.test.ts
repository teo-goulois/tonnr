import { afterEach, describe, expect, it, vi } from "vitest";

import { FormatError } from "../providers/format-error";
import { parseBreaks, readBreaks } from "./file";

// Invented breaks: no list's data is in the tests.
function line(overrides: Record<string, unknown> = {}) {
  return {
    ref: "a1",
    name: "North jetty",
    latitude: 48,
    longitude: -4.5,
    url: "https://example.org/breaks/a1",
    details: { bottom: "sand" },
    ...overrides,
  };
}

function file(breaks: unknown, overrides: Record<string, unknown> = {}) {
  return { provider: "example", breaks, ...overrides };
}

function problemsOf(json: unknown) {
  const read = parseBreaks(json);
  if (!(read instanceof FormatError)) throw new Error("The file was accepted");
  return read.message.split("\n");
}

describe("parseBreaks", () => {
  it("reads a file", () => {
    expect(parseBreaks(file([line()]))).toEqual({
      provider: "example",
      breaks: [
        {
          ref: "a1",
          name: "North jetty",
          latitude: 48,
          longitude: -4.5,
          url: "https://example.org/breaks/a1",
          details: { bottom: "sand" },
        },
      ],
    });
  });

  it("reads what the file says a break is like, in the catalogue's words", () => {
    const characteristics = {
      breakTypes: ["beach", "jetty"],
      waveDirections: ["left", "right"],
      bottomTypes: ["sand"],
      abilityLevels: ["beginner", "intermediate"],
      boardTypes: ["longboard", "fish"],
      bestSeasons: ["autumn", "winter"],
      bestTides: ["mid_low", "mid"],
      bestSwellDirections: ["W", "WNW"],
      bestWindDirections: ["E", "ENE"],
      offshoreDirectionDegrees: 0,
    };
    const placed = { location: ["France", "Finistère"], timezone: "Europe/Paris" };

    expect(parseBreaks(file([line({ characteristics, ...placed })]))).toMatchObject({
      breaks: [{ ref: "a1", characteristics, ...placed }],
    });
  });

  it("takes a break that says no more than where it is", () => {
    const { url: _, details: __, ...bare } = line({ characteristics: {} });

    expect(parseBreaks(file([bare]))).toEqual({
      provider: "example",
      breaks: [{ ref: "a1", name: "North jetty", latitude: 48, longitude: -4.5 }],
    });
  });

  it("keeps the details as the file gives them", () => {
    const details = { size: { sourceValue: "2-4", unit: null }, tags: [], rating: 0 };

    expect(parseBreaks(file([line({ details })]))).toMatchObject({ breaks: [{ details }] });
  });

  it("reads the terms a file gives its list", () => {
    const terms = {
      license: { type: "CC-BY-4.0", url: "https://example.org/licence" },
      attribution: "Example contributors",
    };

    expect(parseBreaks(file([line()], terms))).toMatchObject({ provider: "example", ...terms });
  });

  it.each([
    ["an empty reference", { ref: "" }, '"ref" must be'],
    ["a reference with a space around", { ref: " a1" }, '"ref" must be'],
    ["a reference that is a number", { ref: 12 }, '"ref" must be'],
    ["a reference too long to be one", { ref: "a".repeat(201) }, '"ref" must be'],
    ["an empty name", { name: "" }, '"name" must be'],
    ["a name with a space around", { name: " North jetty" }, '"name" must be'],
    ["a name too long to be one", { name: "a".repeat(201) }, '"name" must be'],
    ["a latitude off the globe", { latitude: 90.1 }, '"latitude" and "longitude"'],
    ["a longitude off the globe", { longitude: -180.5 }, '"latitude" and "longitude"'],
    ["a position written as text", { latitude: "48" }, '"latitude" and "longitude"'],
    ["a missing position", { longitude: undefined }, '"latitude" and "longitude"'],
    ["an address that is not one", { url: "example.org/a1" }, '"url", when given'],
    ["an address that is not the web's", { url: "file:///tmp/a1" }, '"url", when given'],
    ["a location that is a text", { location: "France" }, '"location", when given'],
    ["a location with no place", { location: [] }, '"location", when given'],
    ["a location with an empty place", { location: ["France", ""] }, '"location", when given'],
    ["a time zone nobody keeps", { timezone: "Europe/Ys" }, '"timezone", when given'],
    ["details that are a list", { details: [] }, '"details", when given'],
    ["details that are null", { details: null }, '"details", when given'],
    ["a field the format does not have", { rating: 4 }, "unknown fields: rating"],
    ["a character Postgres cannot store", { name: "North\u0000jetty" }, "U+0000"],
    ["that character deep in the details", { details: { notes: [{ "a\u0000": 1 }] } }, "U+0000"],
    ["a reference with half a character", { ref: "a\uD800" }, "half of a surrogate pair"],
    ["characteristics that are a list", { characteristics: [] }, '"characteristics", when given'],
    [
      "a word the catalogue does not have",
      { characteristics: { breakTypes: ["beach", "Beach_Break"] } },
      '"breakTypes" must be a list of one or more of: beach, reef',
    ],
    [
      "a word given twice",
      { characteristics: { bottomTypes: ["sand", "sand"] } },
      '"bottomTypes" must be',
    ],
    ["an empty list of words", { characteristics: { boardTypes: [] } }, '"boardTypes" must be'],
    [
      "a word that is not in a list",
      { characteristics: { bestTides: "low" } },
      '"bestTides" must be',
    ],
    [
      "a direction that is not a point of the compass",
      { characteristics: { bestWindDirections: ["North"] } },
      '"bestWindDirections" must be',
    ],
    [
      "an offshore direction past the compass",
      { characteristics: { offshoreDirectionDegrees: 360 } },
      '"offshoreDirectionDegrees" must be',
    ],
    [
      "an offshore direction that is not whole",
      { characteristics: { offshoreDirectionDegrees: 22.5 } },
      '"offshoreDirectionDegrees" must be',
    ],
    [
      "a characteristic the catalogue does not have",
      { characteristics: { crowd: 3 } },
      "unknown characteristics: crowd",
    ],
  ])("refuses %s", (_, overrides, expected) => {
    const problems = problemsOf(file([line(), line({ ref: "a2", ...overrides })]));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("break 2");
    expect(problems[0]).toContain(expected);
  });

  it("refuses details nested deeper than any list's are, without failing itself", () => {
    // The line is the first level, and its details the second.
    const nested = (levels: number) => {
      let details: Record<string, unknown> = {};
      for (let level = 3; level <= levels; level += 1) details = { deeper: details };
      return details;
    };
    const refusal = ["break 1 (a1): it is nested more than 64 levels deep, which cannot be stored"];

    expect(parseBreaks(file([line({ details: nested(64) })]))).not.toBeInstanceOf(FormatError);
    expect(problemsOf(file([line({ details: nested(65) })]))).toEqual(refusal);
    expect(problemsOf(file([line({ details: nested(5000) })]))).toEqual(refusal);
  });

  it("refuses a reference given twice", () => {
    expect(problemsOf(file([line(), line({ name: "Again" })]))).toEqual([
      "break 2 (a1): its reference is given twice",
    ]);
  });

  it("refuses a line that is not an object", () => {
    expect(problemsOf(file([line(), "a2"]))).toEqual(["break 2: must be an object"]);
  });

  it.each([
    ["no provider", { provider: undefined }, '"provider" must be'],
    ["a provider that is not a short name", { provider: "Example Inc." }, '"provider" must be'],
    ["a provider in upper case", { provider: "Example" }, '"provider" must be'],
    [
      "a provider with a name too long to be short",
      { provider: "e".repeat(41) },
      '"provider" must be',
    ],
    ["a licence that is a word", { license: "open" }, '"license", when given'],
    ["a licence without its text", { license: { type: "open" } }, '"license", when given'],
    [
      "a licence whose text is not on the web",
      { license: { type: "open", url: "ftp://example.org/licence" } },
      '"license", when given',
    ],
    [
      "a licence with a field the format does not have",
      { license: { type: "open", url: "https://example.org/licence", year: 2026 } },
      '"license", when given',
    ],
    ["an attribution that is empty", { attribution: "" }, '"attribution", when given'],
    ["a field the format does not have", { termsUrl: "x" }, "unknown fields: termsUrl"],
  ])("refuses a file with %s", (_, overrides, expected) => {
    expect(problemsOf(file([line()], overrides))).toEqual([expect.stringContaining(expected)]);
  });

  it.each([
    ["no list", undefined],
    ["an empty list", []],
    ["a list that is not one", { a1: line() }],
  ])("refuses a file with %s", (_, breaks) => {
    expect(problemsOf(file(breaks))).toEqual(['"breaks" must be a list of one break or more']);
  });

  it.each([["a list"], ["a text"], [null]])("refuses a file that holds %s", (content) => {
    expect(problemsOf(content === "a list" ? [line()] : content)).toEqual([
      "the file must hold one object",
    ]);
  });

  it("names every fault of a line, and every faulty line", () => {
    const problems = problemsOf(
      file([line({ name: "", url: "nowhere" }), line({ ref: "a2", latitude: 91 })]),
    );

    expect(problems).toEqual([
      'break 1 (a1): "name" must be a text of 1 to 200 characters, with no space around',
      'break 1 (a1): "url", when given, must be an http or https address',
      'break 2 (a2): "latitude" and "longitude" must be numbers on the globe',
    ]);
  });

  it("shows the first faults of a file that has many, and counts the rest", () => {
    const lines = Array.from({ length: 30 }, (_, index) => line({ ref: `a${index}`, name: "" }));

    const problems = problemsOf(file(lines));

    expect(problems).toHaveLength(21);
    expect(problems.at(-1)).toBe("and 10 more");
  });
});

describe("readBreaks", () => {
  const text = (details: string) =>
    JSON.stringify(file([line({ details: "DETAILS" })])).replace('"DETAILS"', details);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a file's text", () => {
    expect(readBreaks(JSON.stringify(file([line()])))).toMatchObject({
      provider: "example",
      breaks: [{ ref: "a1", details: { bottom: "sand" } }],
    });
  });

  it("takes a number however it is written, when JavaScript holds it as it is", () => {
    const read = readBreaks(
      text('{"a":1.50,"b":15E-1,"c":-0,"d":0.1,"e":1e21,"f":9007199254740992,"g":-12.5e-3}'),
    );

    expect(read).toMatchObject({
      breaks: [
        { details: { a: 1.5, b: 1.5, c: -0, d: 0.1, e: 1e21, f: 9007199254740992, g: -0.0125 } },
      ],
    });
  });

  it.each([
    ["an integer past what a number holds", "9007199254740993"],
    ["a number with more digits than a number holds", "48.123456789012345678"],
    ["a number too large to be one", "1e400"],
    ["a number too small to be told from zero", "1e-400"],
  ])("refuses %s", (_, token) => {
    const read = readBreaks(text(`{"size":[${token}]}`));

    expect(read).toBeInstanceOf(FormatError);
    expect(read).toMatchObject({ message: `the number ${token} of "0" cannot be read as it is` });
  });

  it("refuses such a number in a position too", () => {
    const read = readBreaks(
      JSON.stringify(file([line()])).replace('"latitude":48', '"latitude":48.000000000000000001'),
    );

    expect(read).toMatchObject({
      message: 'the number 48.000000000000000001 of "latitude" cannot be read as it is',
    });
  });

  it("refuses every number when Node does not say how they were written", () => {
    const parse = JSON.parse;
    // What a Node older than the project's does: the reader gets the value and nothing else.
    vi.spyOn(JSON, "parse").mockImplementation((content, reviver) =>
      parse(content, function (this: unknown, key, value) {
        return reviver ? reviver.call(this, key, value) : value;
      }),
    );

    const read = readBreaks(JSON.stringify(file([line()])));

    expect(read).toBeInstanceOf(FormatError);
    expect(read).toMatchObject({
      message: expect.stringContaining('of "latitude" cannot be read as it is'),
    });
  });

  it("refuses a text that is not JSON", () => {
    expect(readBreaks("{ provider: ")).toMatchObject({
      message: expect.stringContaining("the file is not JSON"),
    });
  });

  it("checks what it read as any content is checked", () => {
    expect(readBreaks("[]")).toMatchObject({ message: "the file must hold one object" });
  });
});
