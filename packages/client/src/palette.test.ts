import { describe, expect, it } from "vitest";

import { STARTING_PALETTE, paletteFrom } from "./palette";

describe("the colors of the week's table", () => {
  it("are Windguru's until the reader chooses", () => {
    expect(STARTING_PALETTE).toBe("windguru");
    expect(paletteFrom(null)).toBe("windguru");
  });

  it("are read back only when they are a palette the app knows", () => {
    expect(paletteFrom("tonnr")).toBe("tonnr");
    expect(paletteFrom("rainbow")).toBe("windguru");
  });
});
