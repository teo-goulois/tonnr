import { describe, expect, it } from "vitest";

import { ASK_EVERY_MS, AWAY_MS, onReturn, updateName } from "./updates";

const NOW = Date.UTC(2026, 10, 2, 17);
const MINUTE = 60 * 1000;

describe("onReturn", () => {
  it("runs a downloaded update after a quarter of an hour away", () => {
    expect(onReturn({ now: NOW, leftAt: NOW - AWAY_MS, askedAt: NOW, pending: true })).toBe(
      "reload",
    );
  });

  it("never runs it under a person who only looked away", () => {
    expect(onReturn({ now: NOW, leftAt: NOW - 2 * MINUTE, askedAt: NOW, pending: true })).toBe(
      "nothing",
    );
    // Back from the control centre, which leaves the app inactive and never in the background.
    expect(onReturn({ now: NOW, leftAt: null, askedAt: NOW - 2 * AWAY_MS, pending: true })).toBe(
      "nothing",
    );
  });

  it("asks again once an hour at most", () => {
    expect(
      onReturn({ now: NOW, leftAt: NOW - AWAY_MS, askedAt: NOW - ASK_EVERY_MS, pending: false }),
    ).toBe("ask");
    expect(
      onReturn({ now: NOW, leftAt: NOW - AWAY_MS, askedAt: NOW - 30 * MINUTE, pending: false }),
    ).toBe("nothing");
  });
});

describe("updateName", () => {
  it("names an update by the start of its id, and the binary's own JavaScript by nothing", () => {
    expect(updateName("366321f5-0b1c-4d0e-9f1a-2b3c4d5e6f70")).toBe("366321f5");
    expect(updateName(null)).toBeNull();
  });
});
