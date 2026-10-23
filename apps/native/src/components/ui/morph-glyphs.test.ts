import { describe, expect, it } from "vitest";

import { morphWords } from "./morph-glyphs";

const keys = (text: string) =>
  morphWords(text).flatMap((word) => word.glyphs.map((one) => one.key));

describe("what a morphing text knows its characters by", () => {
  it("changes the last figure alone when a number moves by a little", () => {
    const before = keys("250°–310°");
    const after = keys("255°–310°");
    const kept = after.filter((key) => before.includes(key));

    expect(after.length).toBe(before.length);
    expect(kept.length).toBe(before.length - 1);
    expect(before.filter((key) => !after.includes(key))).toEqual(["d0.0:0"]);
  });

  it("keeps a unit when a figure is added before it", () => {
    const before = keys("1–2 m");
    const after = keys("1–2.5 m");

    expect(after).toContain("m#0");
    expect(before).toContain("m#0");
    expect(after.filter((key) => !before.includes(key))).toEqual([".#0", "d2.0:5"]);
  });

  it("lays the text in words, each ending with its space", () => {
    const words = morphWords("W–NW · 250°");

    expect(words.map((word) => word.glyphs.map((one) => one.char).join(""))).toEqual([
      "W–NW ",
      "· ",
      "250°",
    ]);
  });

  it("gives every character a key of its own", () => {
    const all = keys("10–10 s or 10 s");

    expect(new Set(all).size).toBe(all.length);
  });
});
