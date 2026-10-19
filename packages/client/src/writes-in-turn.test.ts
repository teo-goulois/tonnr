import { describe, expect, it } from "vitest";

import { writesInTurn } from "./writes-in-turn";

// A write whose answer comes when the test says.
function deferred() {
  const calls: { change: string; answer: () => void; fail: () => void }[] = [];
  const write = (change: string) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ change, answer: resolve, fail: () => reject(new Error("refused")) });
    });
  return { calls, write };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("writes made in turn", () => {
  it("start the next write when the one before has answered", async () => {
    const { calls, write } = deferred();
    const settled: boolean[] = [];
    const send = writesInTurn(write, (failed) => settled.push(failed));

    send("first");
    send("second");
    await tick();
    expect(calls.map((call) => call.change)).toEqual(["first"]);

    calls[0]?.answer();
    await tick();
    expect(calls.map((call) => call.change)).toEqual(["first", "second"]);
    // The first has answered, and it is not the last: nothing is settled yet.
    expect(settled).toEqual([]);

    calls[1]?.answer();
    await tick();
    expect(settled).toEqual([false]);
  });

  it("go on after a write that failed, and say so once the last has answered", async () => {
    const { calls, write } = deferred();
    const settled: boolean[] = [];
    const send = writesInTurn(write, (failed) => settled.push(failed));

    send("first");
    send("second");
    await tick();
    calls[0]?.fail();
    await tick();
    expect(settled).toEqual([]);
    calls[1]?.answer();
    await tick();
    expect(settled).toEqual([true]);

    // A failure is said once: the next write starts from a clean slate.
    send("third");
    await tick();
    calls[2]?.answer();
    await tick();
    expect(settled).toEqual([true, false]);
  });
});
