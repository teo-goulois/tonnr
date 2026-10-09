import { afterEach, describe, expect, it, vi } from "vitest";

import { FormatError } from "../providers/format-error";
import { parsePrivateBreaks, readPrivateBreaks } from "./file";

// Invented breaks: no provider's data is in the tests.
function line(overrides: Record<string, unknown> = {}) {
  return {
    ref: "a1",
    name: "North jetty",
    latitude: 48,
    longitude: -4.5,
    url: "https://example.org/breaks/a1",
    collectedAt: "2026-10-08T10:00:00Z",
    details: { bottom: "sand" },
    ...overrides,
  };
}

function file(breaks: unknown, overrides: Record<string, unknown> = {}) {
  return { provider: "example", termsUrl: "https://example.org/terms", breaks, ...overrides };
}

function problemsOf(json: unknown) {
  const read = parsePrivateBreaks(json);
  if (!(read instanceof FormatError)) throw new Error("The file was accepted");
  return read.message.split("\n");
}

describe("parsePrivateBreaks", () => {
  it("reads a file", () => {
    expect(parsePrivateBreaks(file([line()]))).toEqual({
      provider: "example",
      termsUrl: "https://example.org/terms",
      breaks: [
        {
          ref: "a1",
          name: "North jetty",
          latitude: 48,
          longitude: -4.5,
          url: "https://example.org/breaks/a1",
          collectedAt: new Date("2026-10-08T10:00:00Z"),
          details: { bottom: "sand" },
        },
      ],
    });
  });

  it("keeps the details and the name as the file gives them", () => {
    const details = { size: { sourceValue: "2-4", unit: null }, tags: [], rating: 0 };
    const read = parsePrivateBreaks(file([line({ name: " Left  of the pier ", details })]));

    expect(read).toMatchObject({ breaks: [{ name: " Left  of the pier ", details }] });
  });

  it("takes a break without details", () => {
    const { details: _, ...bare } = line();

    expect(parsePrivateBreaks(file([bare]))).toMatchObject({
      breaks: [{ ref: "a1", details: {} }],
    });
  });

  it("reads the instant with the offset the file gives", () => {
    const read = parsePrivateBreaks(file([line({ collectedAt: "2026-10-08T12:00:00.5+02:00" })]));

    expect(read).toMatchObject({ breaks: [{ collectedAt: new Date("2026-10-08T10:00:00.500Z") }] });
  });

  it.each([
    ["an empty reference", { ref: "" }, '"ref" must be'],
    ["a reference with a space around", { ref: " a1" }, '"ref" must be'],
    ["a reference that is a number", { ref: 12 }, '"ref" must be'],
    ["a reference too long to be one", { ref: "a".repeat(201) }, '"ref" must be'],
    ["an empty name", { name: "  " }, '"name" must be a text'],
    ["a latitude off the globe", { latitude: 90.1 }, '"latitude" and "longitude"'],
    ["a longitude off the globe", { longitude: -180.5 }, '"latitude" and "longitude"'],
    ["a position written as text", { latitude: "48" }, '"latitude" and "longitude"'],
    ["a missing position", { longitude: undefined }, '"latitude" and "longitude"'],
    ["an address that is not one", { url: "example.org/a1" }, '"url" must be'],
    ["an address that is not the web's", { url: "file:///tmp/a1" }, '"url" must be'],
    [
      "an address with a character Postgres cannot store",
      { url: "https://example.org/\u0000" },
      "U+0000",
    ],
    ["a date without a time", { collectedAt: "2026-10-08" }, '"collectedAt" must be'],
    [
      "a day its month does not have",
      { collectedAt: "2026-02-30T10:00:00Z" },
      '"collectedAt" must be',
    ],
    [
      "an hour the day does not have",
      { collectedAt: "2026-10-08T24:00:00Z" },
      '"collectedAt" must be',
    ],
    [
      "a time finer than a millisecond",
      { collectedAt: "2026-10-08T10:00:00.1234Z" },
      '"collectedAt" must be',
    ],
    [
      "a year before anyone read a provider",
      { collectedAt: "1969-12-31T23:59:59Z" },
      '"collectedAt" must be',
    ],
    ["the year zero", { collectedAt: "0000-01-01T00:00:00Z" }, '"collectedAt" must be'],
    [
      "an instant that its offset moves past the year 9999",
      { collectedAt: "9999-12-31T23:59:59-12:00" },
      '"collectedAt" must be',
    ],
    [
      "an instant that its offset moves before 1970",
      { collectedAt: "1970-01-01T00:00:00+01:00" },
      '"collectedAt" must be',
    ],
    [
      "an offset that is not one",
      { collectedAt: "2026-10-08T10:00:00+99:00" },
      '"collectedAt" must be',
    ],
    ["a time without its offset", { collectedAt: "2026-10-08T10:00:00" }, '"collectedAt" must be'],
    ["a day that does not exist", { collectedAt: "2026-13-40T10:00:00Z" }, '"collectedAt" must be'],
    ["details that are a list", { details: [] }, '"details" must be an object'],
    ["details that are null", { details: null }, '"details" must be an object'],
    ["a field the format does not have", { rating: 4 }, "unknown fields: rating"],
    ["a character Postgres cannot store", { name: "North\u0000jetty" }, "U+0000"],
    ["that character deep in the details", { details: { notes: [{ "a\u0000": 1 }] } }, "U+0000"],
    ["a reference with half a character", { ref: "a\uD800" }, "half of a surrogate pair"],
    ["a name with half a character", { name: "Jetty \uDC00" }, "half of a surrogate pair"],
    [
      "a field of the details named with half a character",
      { details: { "a\uD800": 1 } },
      "half of a surrogate pair",
    ],
  ])("refuses %s", (_, overrides, expected) => {
    const problems = problemsOf(file([line(), line({ ref: "a2", ...overrides })]));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("break 2");
    expect(problems[0]).toContain(expected);
  });

  it("takes a plain http address, a time to the millisecond, and a whole character", () => {
    const read = parsePrivateBreaks(
      file(
        [
          line({
            name: "Jetty \u{1F30A}",
            url: "http://example.org/breaks/a1",
            collectedAt: "2026-02-28T23:59:59.999-08:00",
          }),
        ],
        { termsUrl: "http://example.org/terms" },
      ),
    );

    expect(read).toMatchObject({
      termsUrl: "http://example.org/terms",
      breaks: [
        {
          name: "Jetty \u{1F30A}",
          url: "http://example.org/breaks/a1",
          collectedAt: new Date("2026-03-01T07:59:59.999Z"),
        },
      ],
    });
  });

  it.each([
    ["a leap day", "2028-02-29T12:00:00+14:00", "2028-02-28T22:00:00Z"],
    ["the first instant", "1970-01-01T00:00:00Z", "1970-01-01T00:00:00Z"],
    ["the last second", "9999-12-31T23:59:59.999Z", "9999-12-31T23:59:59.999Z"],
  ])("takes %s", (_, collectedAt, instant) => {
    expect(parsePrivateBreaks(file([line({ collectedAt })]))).toMatchObject({
      breaks: [{ collectedAt: new Date(instant) }],
    });
  });

  it("refuses details nested deeper than any answer is, without failing itself", () => {
    // The line is the first level, and its details the second.
    const nested = (levels: number) => {
      let details: Record<string, unknown> = {};
      for (let level = 3; level <= levels; level += 1) details = { deeper: details };
      return details;
    };
    const refusal = ["break 1 (a1): it is nested more than 64 levels deep, which cannot be stored"];

    expect(parsePrivateBreaks(file([line({ details: nested(64) })]))).not.toBeInstanceOf(
      FormatError,
    );
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
    ["no terms", { termsUrl: undefined }, '"termsUrl" must be'],
    ["terms that are not an address", { termsUrl: "see the site" }, '"termsUrl" must be'],
    [
      "terms that are not on the web",
      { termsUrl: "ftp://example.org/terms" },
      '"termsUrl" must be',
    ],
    [
      "terms with a character Postgres cannot store",
      { termsUrl: "https://example.org/\u0000" },
      '"termsUrl" must be',
    ],
    ["a field the format does not have", { license: "open" }, "unknown fields: license"],
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
      'break 1 (a1): "name" must be a text',
      'break 1 (a1): "url" must be an http or https address',
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

describe("readPrivateBreaks", () => {
  const text = (details: string) =>
    JSON.stringify(file([line({ details: "DETAILS" })])).replace('"DETAILS"', details);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads a file's text", () => {
    expect(readPrivateBreaks(JSON.stringify(file([line()])))).toMatchObject({
      provider: "example",
      breaks: [{ ref: "a1", details: { bottom: "sand" } }],
    });
  });

  it("takes a number however it is written, when JavaScript holds it as it is", () => {
    const read = readPrivateBreaks(
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
    const read = readPrivateBreaks(text(`{"size":[${token}]}`));

    expect(read).toBeInstanceOf(FormatError);
    expect(read).toMatchObject({ message: `the number ${token} of "0" cannot be read as it is` });
  });

  it("refuses such a number in a position too", () => {
    const read = readPrivateBreaks(
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

    const read = readPrivateBreaks(JSON.stringify(file([line()])));

    expect(read).toBeInstanceOf(FormatError);
    expect(read).toMatchObject({
      message: expect.stringContaining('of "latitude" cannot be read as it is'),
    });
  });

  it("refuses a text that is not JSON", () => {
    expect(readPrivateBreaks("{ provider: ")).toMatchObject({
      message: expect.stringContaining("the file is not JSON"),
    });
  });

  it("checks what it read as any content is checked", () => {
    expect(readPrivateBreaks("[]")).toMatchObject({ message: "the file must hold one object" });
  });
});
