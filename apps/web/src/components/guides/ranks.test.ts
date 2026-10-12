import { describe, expect, it } from "vitest";

import { isHigherRank, LADDER, ladderShare, RANK_FROM } from "./ranks";

describe("the ladder of the ranks", () => {
  it("goes from the first rank an account reaches to the last", () => {
    expect(LADDER).toEqual(["qs", "cs", "ct"]);
  });

  it("puts a rank above the one before it, and any rank above none", () => {
    expect(isHigherRank("qs", null)).toBe(true);
    expect(isHigherRank("cs", "qs")).toBe(true);
    expect(isHigherRank("ct", "cs")).toBe(true);
    expect(isHigherRank("qs", "qs")).toBe(false);
    expect(isHigherRank("qs", "ct")).toBe(false);
  });

  it("stands each rank in the middle of its third", () => {
    expect(ladderShare(0)).toBe(0);
    expect(ladderShare(RANK_FROM.qs)).toBeCloseTo(1 / 6);
    expect(ladderShare(RANK_FROM.cs)).toBeCloseTo(1 / 2);
    expect(ladderShare(RANK_FROM.ct)).toBe(1);
  });

  it("draws a score between two ranks by how far it is from one to the other", () => {
    expect(ladderShare(RANK_FROM.qs / 2)).toBeCloseTo(1 / 12);
    expect(ladderShare((RANK_FROM.qs + RANK_FROM.cs) / 2)).toBeCloseTo(1 / 3);
    expect(ladderShare(RANK_FROM.ct - 1)).toBeLessThan(5 / 6);
  });

  it("is full past the last rank", () => {
    expect(ladderShare(RANK_FROM.ct + 500)).toBe(1);
  });
});
