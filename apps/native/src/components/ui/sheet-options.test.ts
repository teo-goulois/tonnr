import { describe, expect, it } from "vitest";

import { detentsOf, formSheet } from "./sheet-options";

describe("a screen presented as a form sheet", () => {
  it("is the platform's sheet, with a grabber and no header of the navigation's", () => {
    expect(formSheet()).toEqual({
      presentation: "formSheet",
      headerShown: false,
      sheetAllowedDetents: [1],
      sheetInitialDetentIndex: 0,
      sheetLargestUndimmedDetentIndex: "none",
      sheetGrabberVisible: true,
    });
  });

  it("is as tall as what it holds when asked to fit", () => {
    expect(formSheet({ detents: "fit" }).sheetAllowedDetents).toBe("fitToContents");
  });

  it("rests at the heights it is given, and opens at the one named", () => {
    const options = formSheet({ detents: [0.5, 1], initial: 1, undimmedUpTo: 0 });
    expect(options.sheetAllowedDetents).toEqual([0.5, 1]);
    expect(options.sheetInitialDetentIndex).toBe(1);
    expect(options.sheetLargestUndimmedDetentIndex).toBe(0);
  });

  it("refuses a height it does not have", () => {
    expect(() => formSheet({ detents: [0.5, 1], initial: 2 })).toThrow(/no height 2/);
    expect(() => formSheet({ detents: "fit", undimmedUpTo: 1 })).toThrow(/no height 1/);
    expect(() => formSheet({ detents: [1], initial: 0.5 })).toThrow(/no height/);
  });
});

describe("the heights of a sheet", () => {
  it("go from the lowest to the highest, each a share of the screen", () => {
    expect(detentsOf([0.25, 0.5, 1])).toEqual([0.25, 0.5, 1]);
    expect(() => detentsOf([0.5, 0.25])).toThrow(/lowest to the highest/);
    expect(() => detentsOf([0.5, 0.5])).toThrow(/lowest to the highest/);
    expect(() => detentsOf([0, 1])).toThrow(/share of the screen/);
    expect(() => detentsOf([1.2])).toThrow(/share of the screen/);
  });

  it("are one at least and three at most, which Android takes", () => {
    expect(() => detentsOf([])).toThrow(/one height/);
    expect(() => detentsOf([0.2, 0.4, 0.6, 1])).toThrow(/three/);
  });
});
