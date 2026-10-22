import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentSheet,
  floorOver,
  hideSheet,
  isSheetOpen,
  NO_SHEET,
  onSheetChange,
  showSheet,
} from "./sheet-state";

afterEach(() => {
  hideSheet("a");
  hideSheet("b");
});

describe("the sheet in front", () => {
  it("is none until a sheet says itself", () => {
    expect(currentSheet()).toEqual(NO_SHEET);
  });

  it("is the one opened last, and the one under it once it leaves", () => {
    showSheet("a", { height: 300, raised: false });
    showSheet("b", { height: 400, raised: true });
    expect(currentSheet()).toEqual({ height: 400, raised: true });
    // The sheet under it moves meanwhile: the one in front is still what is read.
    showSheet("a", { height: 320, raised: false });
    expect(currentSheet()).toEqual({ height: 400, raised: true });
    hideSheet("b");
    expect(currentSheet()).toEqual({ height: 320, raised: false });
    hideSheet("a");
    expect(currentSheet()).toEqual(NO_SHEET);
  });

  it("says whether a sheet is open, wherever it stands", () => {
    expect(isSheetOpen()).toBe(false);
    showSheet("a", { height: 300, raised: true });
    expect(isSheetOpen()).toBe(true);
    hideSheet("a");
    expect(isSheetOpen()).toBe(false);
  });

  it("tells its listeners of a change, and of nothing that changes nothing", () => {
    const listener = vi.fn();
    const stop = onSheetChange(listener);
    showSheet("a", { height: 300, raised: false });
    showSheet("a", { height: 300, raised: false });
    expect(listener).toHaveBeenCalledTimes(1);
    showSheet("a", { height: 300, raised: true });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    hideSheet("a");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the same answer while nothing changed, as React asks of a store", () => {
    showSheet("a", { height: 300, raised: false });
    expect(currentSheet()).toBe(currentSheet());
  });
});

describe("where the controls stand", () => {
  // A frame under a status bar of 59 points, over a bar of tabs of 83, on a screen of 852.
  const frame = { top: 59, height: 852 - 59 - 83 };

  it("stands at the frame's bottom while no sheet is open", () => {
    expect(floorOver(NO_SHEET, frame, 852, 8)).toBe(8);
  });

  it("stands on the low sheet, with the same room over it", () => {
    // The sheet's top is 852 - 400 = 452 from the screen's top, 393 from the frame's.
    expect(floorOver({ height: 400, raised: false }, frame, 852, 8)).toBe(710 - 393 + 8);
  });

  it("never stands under the frame's own bottom", () => {
    expect(floorOver({ height: 40, raised: false }, frame, 852, 8)).toBe(8);
  });
});
