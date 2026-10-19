import { describe, expect, it } from "vitest";

import { createReportCounter } from "./report-counts";

// What a browser counts of the reports it saw and opened: decision 068.
function counting(start = Date.UTC(2026, 9, 19, 8)) {
  let kept: string | null = null;
  let now = start;
  const later: (() => void)[] = [];
  const told = { seen: [] as string[][], opened: [] as string[] };
  const counter = createReportCounter(
    { get: () => kept, set: (value) => void (kept = value) },
    {
      seen: async (ids) => void told.seen.push(ids),
      opened: async (id) => void told.opened.push(id),
    },
    { now: () => now, later: (run) => void later.push(run) },
  );
  return {
    counter,
    told,
    // Runs what waits for its moment.
    wait: () => later.splice(0).forEach((run) => run()),
    pass: (ms: number) => void (now += ms),
    forget: () => void (kept = null),
    kept: () => kept,
  };
}

describe("the counts of a browser", () => {
  it("tells the reports a page saw together, each once", () => {
    const { counter, told, wait } = counting();
    counter.seen("a");
    counter.seen("b");
    counter.seen("a");
    wait();
    expect(told.seen).toEqual([["a", "b"]]);
    counter.seen("a");
    wait();
    expect(told.seen).toEqual([["a", "b"]]);
  });

  it("tells twenty at a time", () => {
    const { counter, told, wait } = counting();
    for (let index = 0; index < 25; index += 1) counter.seen(`r${index}`);
    wait();
    wait();
    expect(told.seen.map((ids) => ids.length)).toEqual([20, 5]);
  });

  it("counts an opened photo once, and forgets what is a week old", () => {
    const { counter, told, wait, pass } = counting();
    counter.opened("a");
    counter.opened("a");
    counter.seen("a");
    wait();
    expect(told.opened).toEqual(["a"]);
    pass(8 * 24 * 60 * 60 * 1000);
    counter.opened("a");
    expect(told.opened).toEqual(["a", "a"]);
  });

  it("counts again where the browser kept nothing, and takes what it kept wrong as nothing", () => {
    const { counter, told, wait, forget } = counting();
    counter.seen("a");
    wait();
    forget();
    counter.seen("a");
    wait();
    expect(told.seen).toEqual([["a"], ["a"]]);
  });
});
