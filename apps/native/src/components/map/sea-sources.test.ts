import { describe, expect, it } from "vitest";

import { askAgainIn, drawnWhole, momentOf, seaKey, showing } from "./sea-sources";

const nine = "2026-10-24T09:00:00.000Z";
const noon = "2026-10-24T12:00:00.000Z";

describe("the sources of the sea", () => {
  it("names a moment's source by its moment and how many times it was asked again", () => {
    expect(seaKey(nine, 0)).not.toBe(seaKey(nine, 1));
    expect(momentOf(seaKey(nine, 0))).toBe(nine);
    expect(momentOf(seaKey(nine, 3))).toBe(nine);
  });

  it("shows the first source alone", () => {
    expect(showing({}, seaKey(nine, 0))).toEqual({ shown: seaKey(nine, 0) });
  });

  it("keeps the moment in view under the next until the next is drawn whole", () => {
    const next = showing({ shown: seaKey(nine, 0) }, seaKey(noon, 0));
    expect(next).toEqual({ shown: seaKey(noon, 0), under: seaKey(nine, 0) });
    expect(drawnWhole(next)).toEqual({ shown: seaKey(noon, 0) });
  });

  it("keeps the moment before under a moment asked again, which may still miss its tiles", () => {
    const missing = { shown: seaKey(noon, 0), under: seaKey(nine, 0) };
    expect(showing(missing, seaKey(noon, 1))).toEqual({
      shown: seaKey(noon, 1),
      under: seaKey(nine, 0),
    });
  });

  it("keeps a first asking that missed tiles under its asking again, when nothing was before", () => {
    expect(showing({ shown: seaKey(nine, 0) }, seaKey(nine, 1))).toEqual({
      shown: seaKey(nine, 1),
      under: seaKey(nine, 0),
    });
  });

  it("shows alone a source that comes back from under, which was drawn whole", () => {
    const back = showing({ shown: seaKey(noon, 0), under: seaKey(nine, 0) }, seaKey(nine, 0));
    expect(back).toEqual({ shown: seaKey(nine, 0) });
  });

  it("changes nothing for the source already shown", () => {
    const sources = { shown: seaKey(noon, 0), under: seaKey(nine, 0) };
    expect(showing(sources, seaKey(noon, 0))).toBe(sources);
    expect(drawnWhole({ shown: seaKey(noon, 0) })).toEqual({ shown: seaKey(noon, 0) });
  });
});

describe("asking a moment again", () => {
  it("asks soon after a first failure, then less and less often, a minute apart at most", () => {
    const waits = [1, 2, 3, 4, 5, 6, 7, 20].map(askAgainIn);
    expect(waits[0]).toBe(2_000);
    for (let index = 1; index < waits.length; index += 1) {
      expect(waits[index]).toBeGreaterThanOrEqual(waits[index - 1]!);
    }
    expect(Math.max(...waits)).toBe(60_000);
  });
});
