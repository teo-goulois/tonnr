import { describe, expect, it } from "vitest";

import { isClosedToVisitors } from "./visitors";

describe("a refusal of the API", () => {
  it("says that the instance is closed to visitors by its data", () => {
    expect(isClosedToVisitors({ code: "UNAUTHORIZED", data: { visitors: "closed" } })).toBe(true);
  });

  it("is any other refusal without it", () => {
    // A session that ended, a link that opens nothing, a key that does not work.
    expect(isClosedToVisitors({ code: "UNAUTHORIZED" })).toBe(false);
    expect(isClosedToVisitors({ code: "UNAUTHORIZED", data: null })).toBe(false);
    expect(isClosedToVisitors({ code: "UNAUTHORIZED", data: { visitors: "open" } })).toBe(false);
    expect(isClosedToVisitors({ code: "FORBIDDEN", data: { visitors: "closed" } })).toBe(false);
    expect(isClosedToVisitors(new Error("Failed to fetch"))).toBe(false);
    expect(isClosedToVisitors(null)).toBe(false);
  });
});
