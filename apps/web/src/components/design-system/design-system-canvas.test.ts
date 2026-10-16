import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_KEY } from "./canvas-camera";
import { DesignSystemCanvas } from "./design-system-canvas";

const previewPress = vi.hoisted(() => ({ down: vi.fn(), click: vi.fn() }));

vi.mock("./canvas-samples", () => ({
  CanvasSamples: () =>
    createElement(
      "section",
      { id: "demo", "data-canvas-group": "demo" },
      createElement(
        "div",
        { "data-canvas-preview": true },
        createElement("input", { "aria-label": "Demo draft", defaultValue: "Draft" }),
        createElement(
          "button",
          { onPointerDown: previewPress.down, onClick: previewPress.click },
          "Preview action",
        ),
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
  previewPress.down.mockClear();
  previewPress.click.mockClear();
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

function captureOn(host: HTMLElement) {
  const captured = new Set<number>();
  const release = vi.fn((id: number) => captured.delete(id));
  Object.assign(host, {
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: release,
  });
  return { captured, release };
}

function pointer(type: string, target: HTMLElement, x: number, y: number, altKey = false) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    altKey,
  });
  Object.assign(event, { pointerId: 1, pointerType: "mouse" });
  return fireEvent(target, event);
}

describe("the canvas shell around native preview controls", () => {
  it("pans from a preview with Alt without activating it, then restores normal presses", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const button = screen.getByRole("button", { name: "Preview action" });
    const { captured } = captureOn(host);
    expect(pointer("pointerdown", button, 200, 150, true)).toBe(false);
    expect(captured.has(1)).toBe(true);
    pointer("pointermove", host, 260, 185, true);
    frame();
    expect(world.style.transform).toBe("translate(92px, 115px) scale(0.65)");
    pointer("pointerup", host, 260, 185, true);
    fireEvent.click(button, { detail: 1 });
    expect(previewPress.down).not.toHaveBeenCalled();
    expect(previewPress.click).not.toHaveBeenCalled();
    expect(captured.size).toBe(0);
    expect(host.dataset.panning).toBe("false");

    expect(pointer("pointerdown", button, 260, 185)).toBe(true);
    pointer("pointerup", button, 260, 185);
    fireEvent.click(button, { detail: 1 });
    expect(previewPress.down).toHaveBeenCalledOnce();
    expect(previewPress.click).toHaveBeenCalledOnce();
  });

  it("offers Space-drag from the shell while keeping Space native in previews", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const button = screen.getByRole("button", { name: "Preview action" });
    const draft = screen.getByRole("textbox", { name: "Demo draft" });
    captureOn(host);
    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
    expect(fireEvent.keyDown(draft, { key: " " })).toBe(true);
    expect(host.dataset.panReady).not.toBe("true");
    expect(fireEvent.keyDown(host, { key: " " })).toBe(false);
    expect(host.dataset.panReady).toBe("true");
    expect(pointer("pointerdown", button, 100, 100)).toBe(false);
    pointer("pointermove", host, 120, 140);
    fireEvent.keyUp(host, { key: " " });
    expect(host.dataset.panReady).toBe("false");
    // Releasing Space during the drag still finishes the captured gesture.
    pointer("pointermove", host, 130, 150);
    frame();
    expect(world.style.transform).toBe("translate(62px, 130px) scale(0.65)");
    pointer("pointerup", host, 130, 150);
    expect(host.dataset.panning).toBe("false");
    expect(previewPress.down).not.toHaveBeenCalled();
  });

  it("releases the pan modifier and pointer capture when the window loses focus", () => {
    render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const button = screen.getByRole("button", { name: "Preview action" });
    const { captured } = captureOn(host);
    fireEvent.keyDown(host, { key: " " });
    pointer("pointerdown", button, 100, 100);
    fireEvent(window, new Event("blur"));
    expect(captured.size).toBe(0);
    expect(host.dataset.panReady).toBe("false");
    expect(host.dataset.panning).toBe("false");
    pointer("pointerdown", button, 100, 100);
    expect(previewPress.down).toHaveBeenCalledOnce();
  });

  it("starts Space-drag after a preview button has focus without requiring a background click", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const button = screen.getByRole("button", { name: "Preview action" });
    captureOn(host);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1440, 900));
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 100, 40));
    button.focus();
    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
    expect(host.dataset.panReady).not.toBe("true");
    expect(pointer("pointerdown", button, 100, 100)).toBe(false);
    expect(document.activeElement).toBe(host);
    pointer("pointermove", host, 150, 130);
    frame();
    expect(world.style.transform).toBe("translate(82px, 110px) scale(0.65)");
    pointer("pointerup", host, 150, 130);
    expect(fireEvent.keyUp(host, { key: " " })).toBe(false);
    fireEvent.click(button, { detail: 1 });
    expect(previewPress.down).not.toHaveBeenCalled();
    expect(previewPress.click).not.toHaveBeenCalled();

    button.focus();
    // A keyboard-only Space press still belongs to the preview button.
    expect(fireEvent.keyDown(button, { key: " " })).toBe(true);
    expect(fireEvent.keyUp(button, { key: " " })).toBe(true);
    fireEvent.click(button, { detail: 0 });
    expect(previewPress.click).toHaveBeenCalledOnce();
  });

  it("keeps Space in text editors and portals, but arms Option-drag even from an input", () => {
    render(createElement(DesignSystemCanvas));
    const host = screen.getByRole("region", { name: "Design system canvas" });
    const draft = screen.getByRole("textbox", { name: "Demo draft" });
    const { captured } = captureOn(host);
    draft.focus();
    expect(fireEvent.keyDown(draft, { key: " " })).toBe(true);
    expect(pointer("pointerdown", draft, 100, 100)).toBe(true);
    expect(captured.size).toBe(0);
    expect(fireEvent.keyUp(draft, { key: " " })).toBe(true);

    const portal = document.createElement("button");
    document.body.append(portal);
    try {
      expect(fireEvent.keyDown(portal, { key: " " })).toBe(true);
      expect(host.dataset.panReady).not.toBe("true");
      expect(fireEvent.keyUp(portal, { key: " " })).toBe(true);
      expect(fireEvent.keyDown(portal, { key: "Alt", altKey: true })).toBe(true);
      expect(host.dataset.panReady).not.toBe("true");
      fireEvent.keyUp(portal, { key: "Alt" });
    } finally {
      portal.remove();
    }

    expect(fireEvent.keyDown(draft, { key: "Alt", altKey: true })).toBe(true);
    expect(host.dataset.panReady).toBe("true");
    const backdrop = host.querySelector<HTMLElement>("[data-canvas-space]")!;
    expect(pointer("pointerdown", backdrop, 100, 100)).toBe(false);
    expect(captured.has(1)).toBe(true);
    pointer("pointercancel", host, 100, 100);
    fireEvent.keyUp(host, { key: "Alt" });
    expect(captured.size).toBe(0);
    expect(host.dataset.panReady).toBe("false");
  });

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

  it("routes modified wheel and browser zoom keys to the camera over previews and portals", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const draft = screen.getByRole("textbox", { name: "Demo draft" });
    const portal = document.createElement("input");
    document.body.append(portal);
    try {
      for (const target of [draft, screen.getByRole("button", { name: "Zoom in" }), portal]) {
        const before = world.style.transform;
        expect(
          fireEvent.wheel(target, { ctrlKey: true, deltaY: -10, clientX: 200, clientY: 150 }),
        ).toBe(false);
        frame();
        expect(world.style.transform).not.toBe(before);
      }
      const beforeScroll = world.style.transform;
      expect(fireEvent.wheel(portal, { deltaY: 30 })).toBe(true);
      frame();
      expect(world.style.transform).toBe(beforeScroll);

      for (const modifier of ["ctrlKey", "metaKey"]) {
        expect(fireEvent.keyDown(draft, { key: "0", [modifier]: true })).toBe(false);
        frame();
        expect(world.style.transform).toBe("translate(32px, 80px) scale(0.65)");
        expect(fireEvent.keyDown(portal, { key: "+", [modifier]: true })).toBe(false);
        frame();
        expect(world.style.transform).toContain("scale(0.78)");
        expect(fireEvent.keyDown(draft, { key: "-", [modifier]: true })).toBe(false);
        frame();
        expect(world.style.transform).toContain("scale(0.65)");
        expect(fireEvent.keyDown(draft, { key: "z", [modifier]: true })).toBe(true);
      }
    } finally {
      portal.remove();
    }
  });

  it("uses relative Safari gesture scales and avoids also applying wheel zoom", () => {
    const { container } = render(createElement(DesignSystemCanvas));
    const world = container.querySelector<HTMLElement>("[data-canvas-world]")!;
    const gesture = (type: string, scale?: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { scale, clientX: 100, clientY: 100 });
      fireEvent(document, event);
      expect(event.defaultPrevented).toBe(true);
      frame();
    };
    gesture("gesturestart");
    gesture("gesturechange", 1.2);
    expect(world.style.transform).toContain("scale(0.78)");
    const once = world.style.transform;
    fireEvent.wheel(document, { ctrlKey: true, deltaY: -30 });
    frame();
    expect(world.style.transform).toBe(once);
    gesture("gesturechange", NaN);
    expect(world.style.transform).toBe(once);
    gesture("gesturechange", 1.5);
    expect(world.style.transform).toContain("scale(0.975");
    gesture("gestureend");
    gesture("gesturestart");
    gesture("gesturechange", 2);
    expect(world.style.transform).toContain("scale(1.95");
    gesture("gestureend");
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
    expect(fireEvent.wheel(link, { ctrlKey: true, deltaY: -30 })).toBe(true);
    expect(fireEvent.keyDown(link, { key: "+", metaKey: true })).toBe(true);
    expect(fireEvent(link, new Event("gesturestart", { bubbles: true, cancelable: true }))).toBe(
      true,
    );
    link.remove();
  });
});
