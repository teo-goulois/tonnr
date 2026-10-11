import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { MetricLanes } from "./details/metric-lanes";
import type { Sample } from "./details/metrics";
import { SeaChart } from "./sea-chart";

vi.mock("./chart-turns", () => ({ useChartTurn: () => true }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["lanes", "sea"])("keeps the %s SVG touch target throughout inspection", async (kind) => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 320,
    height: 200,
    right: 320,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON() {},
  });
  const start = Date.UTC(2026, 0, 1);
  const points = [0, 1, 2].map((hour) => ({
    time: new Date(start + hour * 3600000),
    value: hour + 1,
  }));
  const model = points.map(({ time, value }) => ({
    time: time.getTime(),
    height: value,
    period: 10,
    energy: 100,
    wind: 12,
    gust: null,
    windDirection: null,
    waveDirection: null,
    cloud: null,
    rain: null,
    air: null,
  })) satisfies Sample[];
  const { container } = render(
    kind === "lanes"
      ? createElement(MetricLanes, { measured: [], model, start, end: start + 7200000, now: start })
      : createElement(SeaChart, { label: "Test", points, formatValue: String }),
  );
  await waitFor(() => expect(container.querySelector(".recharts-area-curve")).not.toBeNull());
  const target = container.querySelector(".recharts-area-curve")!;
  const surface =
    kind === "lanes" ? target.closest("figure")! : target.closest("figure")!.querySelector("div")!;
  surface.getBoundingClientRect = () => ({ left: 0, width: 320 }) as DOMRect;
  const send = (type: string, x: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", {
      value: type === "touchend" ? [] : [{ identifier: 1, clientX: x, clientY: 40 }],
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };
  send("touchstart", 70);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(target.isConnected).toBe(true);
  const before = container.textContent;
  expect(send("touchmove", 290).defaultPrevented).toBe(true);
  await waitFor(() => expect(container.textContent).not.toBe(before));
  expect(target.isConnected).toBe(true);
  send("touchend", 290);
});
