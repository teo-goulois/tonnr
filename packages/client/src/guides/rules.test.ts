import { describe, expect, it } from "vitest";

import { reasonFault, sameWords, saidOf, textFault, textMostOf, wordsFault } from "./rules";

const faults = {
  tooShort: () => "short",
  same: () => "same",
  wordsNone: () => "none",
};

describe("what a line of a guide takes (decision 041)", () => {
  it("sends a text on one line, its spaces as one", () => {
    expect(saidOf("  On the  left\n of the jetty ")).toBe("On the left of the jetty");
  });

  it("takes one sentence of the size against the forecast, and a longer text elsewhere", () => {
    expect(textMostOf("sizeNotes")).toBe(140);
    expect(textMostOf("access")).toBe(500);
  });

  it("refuses a text that is too short, or what the line says already", () => {
    expect(textFault(" a\n ", "", faults)).toBe("short");
    expect(textFault("Park by  the church", "Park by the church", faults)).toBe("same");
    expect(textFault("Park by the church", "", faults)).toBeUndefined();
  });

  it("reads two lists as the same words whatever their order", () => {
    expect(sameWords(["sand", "rock"], ["rock", "sand"])).toBe(true);
    expect(sameWords([], [])).toBe(true);
    expect(sameWords(["sand"], ["sand", "rock"])).toBe(false);
    expect(sameWords(["reef"], ["sand"])).toBe(false);
  });

  it("refuses no word, or the words the line says in another order", () => {
    expect(wordsFault([], ["sand"], faults)).toBe("none");
    expect(wordsFault(["sand", "rock"], ["rock", "sand"], faults)).toBe("same");
    expect(wordsFault(["rock"], ["sand"], faults)).toBeUndefined();
  });

  it("refuses a reason of fewer than three characters once trimmed", () => {
    expect(reasonFault("  no ", faults)).toBe("short");
    expect(reasonFault("Not a reef", faults)).toBeUndefined();
  });
});
