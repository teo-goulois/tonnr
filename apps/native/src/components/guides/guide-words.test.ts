import { afterEach, describe, expect, it } from "vitest";

import { baseLocale, setLocale } from "@/paraglide/runtime.js";

import {
  bearingsOf,
  CHARACTERISTIC_FIELDS,
  readSizeFactors,
  wordsText,
} from "./characteristic-words";
import {
  answerAfter,
  authorName,
  isSendableText,
  isSendableWords,
  mayBlockAuthor,
  points,
  progressOf,
  readContribution,
  reasonRefusal,
  saidOf,
  spreadText,
  textRefusal,
  wordsRefusal,
  writtenIn,
} from "./guide-words";

afterEach(() => {
  void setLocale(baseLocale, { reload: false });
});

describe("the words of a guide, as the web says them (decision 041)", () => {
  it("lists the catalogue's lines of words in the web's order", () => {
    expect(CHARACTERISTIC_FIELDS.map((field) => field.key)).toEqual([
      "breakTypes",
      "waveDirections",
      "bottomTypes",
      "abilityLevels",
      "boardTypes",
      "bestSeasons",
      "bestTides",
      "bestSwellDirections",
      "bestWindDirections",
      "sizeFactors",
    ]);
  });

  it("reads a list of words in the catalogue's order, and points by their names", () => {
    expect(wordsText("bottomTypes", ["rock", "sand"])).toBe("Sand, Rock");
    expect(wordsText("bestSwellDirections", ["WNW", "W", "NW"])).toBe("W, WNW, NW");
    expect(bearingsOf(["NW", "N", "W"])).toEqual([0, 270, 315]);
    void setLocale("fr", { reload: false });
    expect(wordsText("bestSwellDirections", ["WNW"])).toBe("ONO");
  });

  it("reads the size against the forecast as one step or a range", () => {
    expect(readSizeFactors([])).toBe("");
    expect(readSizeFactors(["double", "same"])).toMatch(/forecast/i);
  });

  it("sends a text once it says something new, on one line", () => {
    expect(saidOf("  On the  left\n of the jetty ")).toBe("On the left of the jetty");
    expect(isSendableText("ab", "")).toBe(false);
    expect(isSendableText("Park by the church", "Park by the church")).toBe(false);
    expect(isSendableText("Park by the church", "")).toBe(true);
    expect(isSendableWords([], [])).toBe(false);
    expect(isSendableWords(["sand"], ["sand"])).toBe(false);
    expect(isSendableWords(["rock", "sand"], ["sand"])).toBe(true);
  });

  it("says why a line or a contest cannot be sent, as the web's editors say it", () => {
    expect(textRefusal(" a\n ", "")).toBe("Write at least 3 characters.");
    expect(textRefusal("Park by  the church", "Park by the church")).toBe(
      "The guide already says so.",
    );
    expect(textRefusal("Park by the church", "")).toBeUndefined();
    expect(wordsRefusal([], ["sand"])).toBe("Pick at least one.");
    expect(wordsRefusal(["sand", "rock"], ["rock", "sand"])).toBe("The guide already says so.");
    expect(wordsRefusal(["rock"], ["sand"])).toBeUndefined();
    expect(reasonRefusal("  no ")).toBe("Write at least 3 characters.");
    expect(reasonRefusal("Not a reef")).toBeUndefined();
  });

  it("takes an answer back when the one given is pressed again", () => {
    expect(answerAfter(undefined, "busy")).toBe("busy");
    expect(answerAfter("busy", "quiet")).toBe("quiet");
    expect(answerAfter("busy", "busy")).toBeNull();
  });

  it("says how answers spread only once enough accounts gave one", () => {
    expect(spreadText({ question: "crowd", total: 0, counts: null })).toBe(
      "No answer yet. What do you say?",
    );
    expect(
      spreadText({ question: "level", total: 0, counts: null }, "From the list: Beginner"),
    ).toBe("From the list: Beginner");
    expect(spreadText({ question: "crowd", total: 2, counts: null })).toMatch(/^2 answers/);
    expect(
      spreadText({ question: "crowd", total: 4, counts: { busy: 3, quiet: 1, packed: 0 } }),
    ).toBe("4 answers · Quiet: 1 · Busy: 3");
  });

  it("names an author, a contributor when it names nobody, and blocks only another's", () => {
    expect(authorName({ username: "teo" })).toBe("@teo");
    expect(authorName(null)).toBe("A contributor");
    expect(mayBlockAuthor(null, "teo")).toBe(false);
    expect(mayBlockAuthor({ username: "teo" }, "teo")).toBe(false);
    expect(mayBlockAuthor({ username: "lea" }, "teo")).toBe(true);
    expect(mayBlockAuthor({ username: "lea" }, null)).toBe(true);
  });

  it("says the language of a text to a reader of another", () => {
    expect(writtenIn("en")).toBeUndefined();
    expect(writtenIn(null)).toBeUndefined();
    expect(writtenIn("fr")).toBe("Written in French");
  });

  it("reads a contribution's line and value", () => {
    expect(readContribution({ line: "place", value: null }).value).toBeNull();
    expect(readContribution({ line: "access", value: "By the steps" })).toEqual({
      label: "Access",
      value: "By the steps",
    });
    expect(readContribution({ line: "bestTides", value: ["mid", "low"] }).value).toBe("Low, Mid");
  });

  it("counts points as each language does, and the way to the next rank", () => {
    expect(points(1)).toBe("1 point");
    expect(points(0)).toBe("0 points");
    void setLocale("fr", { reload: false });
    expect(points(0)).toBe("0 point");
    expect(progressOf(30, { from: 150 })).toEqual({ share: 0.2, lacking: 120 });
    expect(progressOf(200, { from: 150 })).toEqual({ share: 1, lacking: 0 });
    expect(progressOf(700, null)).toBeNull();
  });
});
