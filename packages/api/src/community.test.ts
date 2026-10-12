import { describe, expect, it } from "vitest";

import {
  higherRank,
  keptText,
  keptWords,
  nextRank,
  pointsOf,
  ranksAt,
  sameValue,
} from "./community";

// What accounts write of a break: decision 041.
describe("a contribution's value", () => {
  it("keeps a list of words once through, in the order of its vocabulary", () => {
    expect(keptWords("bestTides", ["high", "low", "high"])).toEqual(["low", "high"]);
    expect(keptWords("bestSwellDirections", ["W", "NW", "WNW"])).toEqual(["W", "WNW", "NW"]);
  });

  it("keeps nothing of a list with no word of its line", () => {
    expect(keptWords("bottomTypes", [])).toBeNull();
    expect(keptWords("bottomTypes", ["left", "mud"])).toBeNull();
    // A word of another line is no word of this one.
    expect(keptWords("waveDirections", ["sand", "left"])).toEqual(["left"]);
  });

  it("keeps a text on one line", () => {
    expect(keptText("  Park by the church.\n\nWalk   down the path. ")).toBe(
      "Park by the church. Walk down the path.",
    );
  });

  it("tells two values that say the same, whichever kind they are", () => {
    expect(sameValue(["sand"], ["sand"])).toBe(true);
    expect(sameValue(["sand"], ["sand", "rock"])).toBe(false);
    // The catalogue keeps its lists in the order they came in.
    expect(sameValue(["rock", "sand"], ["sand", "rock"])).toBe(true);
    expect(sameValue(["rock", "rock"], ["rock", "sand"])).toBe(false);
    expect(sameValue("By the pier.", "By the pier.")).toBe(true);
    expect(sameValue("By the pier.", "By the pier")).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue(null, ["sand"])).toBe(false);
    expect(sameValue("sand", ["sand"])).toBe(false);
  });
});

describe("a score and its ranks", () => {
  it("counts a text for more than a list of words, and a break for more than either", () => {
    expect(pointsOf("bottomTypes")).toBe(5);
    expect(pointsOf("hazards")).toBe(10);
    expect(pointsOf("place")).toBe(20);
  });

  it("reaches each rank at its score, and none before the first", () => {
    expect(ranksAt(0)).toEqual([]);
    expect(ranksAt(19)).toEqual([]);
    expect(ranksAt(20)).toEqual(["qs"]);
    expect(ranksAt(150)).toEqual(["qs", "cs"]);
    expect(ranksAt(6000)).toEqual(["qs", "cs", "ct"]);
  });

  it("names the rank after one, and none after the last", () => {
    expect(nextRank(null)).toEqual({ rank: "qs", from: 20 });
    expect(nextRank("qs")).toEqual({ rank: "cs", from: 150 });
    expect(nextRank("ct")).toBeNull();
  });

  it("keeps the higher of two ranks", () => {
    expect(higherRank(null, null)).toBeNull();
    expect(higherRank("cs", null)).toBe("cs");
    expect(higherRank("qs", "ct")).toBe("ct");
    expect(higherRank("ct", "cs")).toBe("ct");
  });
});
