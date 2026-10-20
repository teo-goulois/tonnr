import { SIZES } from "@repo/conditions/sessions/sizes";
import { describe, expect, it } from "vitest";

import {
  answersOf,
  hasAnswer,
  isTabPath,
  NO_ANSWERS,
  pickWave,
  sameAnswers,
  stepsOf,
  toggleBoard,
} from "./profiling";

describe("the questions an account is asked once", () => {
  it("are four, with a username first for an account that has none", () => {
    expect(stepsOf(false)).toEqual(["level", "waves", "reading", "boards"]);
    expect(stepsOf(true)).toEqual(["username", "level", "waves", "reading", "boards"]);
  });

  it("go on once a step is answered, and skip it otherwise", () => {
    expect(hasAnswer("level", NO_ANSWERS, null)).toBe(false);
    expect(hasAnswer("level", { ...NO_ANSWERS, level: "advanced" }, null)).toBe(true);
    expect(hasAnswer("waves", { ...NO_ANSWERS, smallestWave: "knee" }, null)).toBe(false);
    expect(
      hasAnswer("waves", { ...NO_ANSWERS, smallestWave: "knee", biggestWave: "head" }, null),
    ).toBe(true);
    expect(hasAnswer("username", NO_ANSWERS, "kelly")).toBe(true);
    expect(hasAnswer("username", NO_ANSWERS, null)).toBe(false);
  });

  it("say the smallest wave at a first press and the biggest at a second, and begin again after", () => {
    const none = { smallest: null, biggest: null };
    const first = pickWave(SIZES, none, "knee");
    expect(first).toEqual({ smallest: "knee", biggest: null });
    const second = pickWave(SIZES, first, "head");
    expect(second).toEqual({ smallest: "knee", biggest: "head" });
    expect(pickWave(SIZES, second, "waist")).toEqual({ smallest: "waist", biggest: null });
    // A smaller size than the smallest begins again from it.
    expect(pickWave(SIZES, first, "ankle")).toEqual({ smallest: "ankle", biggest: null });
    // The same size twice is waves of one size.
    expect(pickWave(SIZES, first, "knee")).toEqual({ smallest: "knee", biggest: "knee" });
  });

  it("keep the boards pressed, and none as null", () => {
    expect(toggleBoard(null, "fish")).toEqual(["fish"]);
    expect(toggleBoard(["fish"], "longboard")).toEqual(["fish", "longboard"]);
    expect(toggleBoard(["fish"], "fish")).toBeNull();
  });

  it("start from what the account answered before", () => {
    expect(answersOf(null)).toEqual(NO_ANSWERS);
    expect(
      answersOf({
        ...NO_ANSWERS,
        level: "pro",
        boards: ["gun"],
        waveFaceMeters: null,
        answeredAt: new Date(),
        putOffAt: null,
      }),
    ).toEqual({ ...NO_ANSWERS, level: "pro", boards: ["gun"] });
  });

  it("open on a tab's own screen, and wait while a sheet stands over the tabs", () => {
    expect(isTabPath("/")).toBe(true);
    expect(isTabPath("/account")).toBe(true);
    expect(isTabPath("/account/profile")).toBe(true);
    expect(isTabPath("/saved")).toBe(true);
    expect(isTabPath("/alerts")).toBe(true);
    expect(isTabPath("/alert/new")).toBe(false);
    expect(isTabPath("/sign-in")).toBe(false);
    expect(isTabPath("/place/break/12")).toBe(false);
    expect(isTabPath("/onboarding")).toBe(false);
  });
});

describe("answers that were changed", () => {
  it("are told from those that were kept, the boards in any order", () => {
    const kept = {
      ...NO_ANSWERS,
      level: "advanced" as const,
      boards: ["fish" as const, "gun" as const],
    };
    expect(sameAnswers(kept, { ...kept, boards: ["gun", "fish"] })).toBe(true);
    expect(sameAnswers(kept, { ...kept, level: "pro" })).toBe(false);
    expect(sameAnswers(kept, { ...kept, boards: null })).toBe(false);
    expect(sameAnswers(NO_ANSWERS, { ...NO_ANSWERS, boards: null })).toBe(true);
  });
});
