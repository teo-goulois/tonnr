import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CHART_HOLD_MS, nearestChartPoint, useChartTouch } from "./use-chart-touch";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ left: 10, width: 330 }) as DOMRect;
  const hook = renderHook(() => useChartTouch({ start: 0, end: 100, left: 30 }));
  act(() => hook.result.current.ref(element));
  function touch(type: string, x = 190, y = 50, count = 1, cancelable = true) {
    const event = new Event(type, { bubbles: true, cancelable });
    Object.defineProperty(event, "touches", {
      value: Array.from({ length: count }, (_, identifier) => ({
        identifier,
        clientX: x,
        clientY: y,
      })),
    });
    act(() => {
      element.dispatchEvent(event);
    });
    return event;
  }
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  return { ...hook, touch, advance };
}

describe("touch chart inspection", () => {
  it("waits for a hold, tracks within the plot, and releases on finger up", () => {
    const { result, touch, advance } = setup();
    touch("touchstart");
    advance(CHART_HOLD_MS - 1);
    expect(result.current.time).toBeUndefined();
    advance(1);
    expect(result.current.time).toBe(50);
    expect(touch("touchmove", 340).defaultPrevented).toBe(true);
    advance(20);
    expect(result.current.time).toBe(100);
    touch("touchmove", 0);
    advance(20);
    expect(result.current.time).toBe(0);
    touch("touchend", 0, 0, 0);
    expect(result.current.time).toBeUndefined();
  });

  it.each([
    [210, 50],
    [190, 80],
  ])("leaves horizontal and vertical swipes to native scrolling", (x, y) => {
    const { result, touch, advance } = setup();
    touch("touchstart");
    expect(touch("touchmove", x, y).defaultPrevented).toBe(false);
    advance(CHART_HOLD_MS + 1);
    expect(result.current.time).toBeUndefined();
  });

  it("does not inspect a quick tap or a cancelled gesture", () => {
    const { result, touch, advance } = setup();
    touch("touchstart");
    touch("touchend", 190, 50, 0);
    advance(CHART_HOLD_MS);
    expect(result.current.time).toBeUndefined();
    touch("touchstart");
    advance(CHART_HOLD_MS);
    touch("touchcancel", 190, 50, 0);
    expect(result.current.time).toBeUndefined();
  });

  it("gives pinch zoom and a gesture already owned by the browser back to it", () => {
    const { result, touch, advance } = setup();
    touch("touchstart");
    advance(CHART_HOLD_MS);
    expect(touch("touchmove", 190, 50, 2).defaultPrevented).toBe(false);
    expect(result.current.time).toBeUndefined();
    touch("touchstart");
    advance(CHART_HOLD_MS);
    touch("touchmove", 220, 50, 1, false);
    expect(result.current.time).toBeUndefined();
  });

  it("cleans up a pending hold when the chart unmounts", () => {
    const { touch, advance, unmount } = setup();
    touch("touchstart");
    unmount();
    advance(CHART_HOLD_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("snaps to actual samples, including irregular measurements", () => {
    const rows = [{ time: 0 }, { time: 20 }, { time: 75 }];
    expect(nearestChartPoint(rows, 60)).toBe(rows[2]);
    expect(nearestChartPoint(rows, undefined)).toBeUndefined();
    expect(nearestChartPoint([], 60)).toBeUndefined();
  });
});
