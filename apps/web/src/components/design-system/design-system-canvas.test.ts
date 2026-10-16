import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_KEY } from "./canvas-camera";
import { DesignSystemCanvas } from "./design-system-canvas";

vi.mock("./canvas-samples", () => ({
  CanvasSamples: () =>
    createElement(
      "section",
      { id: "demo", "data-canvas-group": "demo" },
      createElement(
        "div",
        { "data-canvas-preview": true },
        createElement("input", { "aria-label": "Demo draft", defaultValue: "Draft" }),
      ),
    ),
}));
vi.mock("@/components/shared/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", {}, "Theme"),
}));

const disconnect = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  disconnect.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const frame = () => act(() => vi.advanceTimersByTime(16));

describe("the canvas shell around native preview controls", () => {
  it("coalesces wheel movements and leaves input keys, wheel events and drafts alone", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const draft = screen.getByRole("textbox", { name: "Demo draft" }) as HTMLInputElement;
    const before = world.style.transform;
    fireEvent.wheel(host, { deltaX: 40, deltaY: 20 });
    fireEvent.wheel(host, { deltaX: 60, deltaY: 30 });
    expect(world.style.transform).toBe(before);
    frame();
    expect(world.style.transform).toBe("translate(-68px, 30px) scale(0.65)");
    const moved = world.style.transform;
    expect(fireEvent.wheel(draft, { deltaX: 200 })).toBe(true);
    fireEvent.keyDown(draft, { key: "ArrowRight" });
    frame();
    expect(world.style.transform).toBe(moved);
    fireEvent.change(draft, { target: { value: "Unsaved surf notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    frame();
    expect(draft.value).toBe("Unsaved surf notes");
    expect(world.style.transform).toBe(before);
    act(() => vi.advanceTimersByTime(200));
    expect(JSON.parse(localStorage.getItem(CAMERA_KEY)!)).toEqual({
      version: 1,
      camera: { x: 32, y: 80, zoom: 0.65 },
    });
  });

  it("disconnects layout observation, cancels pending work and removes the document navigation guard on teardown", () => {
    const { unmount } = render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const link = document.createElement("a");
    link.href = "#demo";
    document.body.append(link);
    const mountedClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(mountedClick);
    expect(mountedClick.defaultPrevented).toBe(true);
    fireEvent.wheel(host, { deltaX: 50 });
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const afterUnmount = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    link.remove();
  });
});
