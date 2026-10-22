import { describe, expect, it, vi } from "vitest";

import { askToDescribe, onDescribeAsked, takeDescribeAsk } from "./describing";

describe("the ask to describe a spot", () => {
  it("is answered once, by the guide of that spot alone", () => {
    askToDescribe("s1");
    expect(takeDescribeAsk("s2")).toBe(false);
    expect(takeDescribeAsk("s1")).toBe(true);
    expect(takeDescribeAsk("s1")).toBe(false);
  });

  it("is heard by a guide that is drawn, and waits for one that is not", () => {
    const listener = vi.fn();
    const stop = onDescribeAsked(listener);
    askToDescribe("s1");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    askToDescribe("s1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeDescribeAsk("s1")).toBe(true);
  });
});
