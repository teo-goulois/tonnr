import { SURF_SIZES } from "@repo/db/schema/sessions";
import { describe, expect, it } from "vitest";

import { SIZES, SURF_FACES, setsFit } from "./sizes";

describe("SURF_FACES", () => {
  it("has the sizes the database keeps, in their order", () => {
    expect(SIZES).toEqual(SURF_SIZES);
  });

  it("follows each size on from the one before, and draws it within its heights", () => {
    let from = 0;
    for (const size of SURF_SIZES) {
      const face = SURF_FACES[size];
      expect(face.least).toBe(from);
      expect(face.drawn).toBeGreaterThan(face.least);
      if (face.most !== null) expect(face.drawn).toBeLessThanOrEqual(face.most);
      from = face.most ?? Number.POSITIVE_INFINITY;
    }
    expect(from).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("setsFit", () => {
  it("takes sets as big as the waves or bigger, and either left unsaid", () => {
    expect(setsFit("waist", "head")).toBe(true);
    expect(setsFit("head", "head")).toBe(true);
    expect(setsFit("head", "waist")).toBe(false);
    expect(setsFit(null, "waist")).toBe(true);
    expect(setsFit("head", null)).toBe(true);
  });
});
