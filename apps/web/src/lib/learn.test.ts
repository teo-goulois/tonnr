import { describe, expect, it } from "vitest";

import { LESSONS, LEVELS, TERMS, guidePath, parseProse } from "./learn";

describe("the guides", () => {
  it("each have five lessons, with ids that can be anchors", () => {
    for (const level of LEVELS) {
      expect(LESSONS[level]).toHaveLength(5);
      for (const lesson of LESSONS[level]) expect(lesson).toMatch(/^[a-z-]+$/);
    }
    expect(guidePath("beginner")).toBe("/learn/beginner");
  });

  it("have a glossary whose ids are anchors too, each once", () => {
    expect(new Set(TERMS).size).toBe(TERMS.length);
    for (const term of TERMS) expect(term).toMatch(/^[a-z-]+$/);
  });
});

describe("parseProse", () => {
  it("reads the words, the darker ones and the terms", () => {
    expect(parseProse("The **height** is that of the [swell](swell) offshore.")).toEqual([
      { kind: "text", text: "The " },
      { kind: "strong", text: "height" },
      { kind: "text", text: " is that of the " },
      { kind: "term", term: "swell", text: "swell" },
      { kind: "text", text: " offshore." },
    ]);
  });

  it("leaves a word whose id is no term as it was written", () => {
    expect(parseProse("a [word](nothing) here")).toEqual([
      { kind: "text", text: "a " },
      { kind: "text", text: "word" },
      { kind: "text", text: " here" },
    ]);
  });

  it("reads a paragraph with no mark as one piece, and an empty one as none", () => {
    expect(parseProse("plain")).toEqual([{ kind: "text", text: "plain" }]);
    expect(parseProse("")).toEqual([]);
  });
});
