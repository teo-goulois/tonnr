import { Button } from "@repo/ui/components/ui/button";
import { MaximizeIcon, MinusIcon, PlusIcon, RestartIcon } from "@repo/ui/icon";
import { memo, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { CanvasSamples } from "./canvas-samples";
import {
  CAMERA_KEY,
  DEFAULT_CAMERA,
  cameraOf,
  fitCamera,
  readCamera,
  saveCamera,
  zoomAt,
  type Bounds,
  type Camera,
} from "./canvas-camera";

const Samples = memo(CanvasSamples);

export function DesignSystemCanvas() {
  const shell = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ ...DEFAULT_CAMERA });
  const move = useRef<(next: Camera) => void>(() => {});
  const fit = useRef<() => void>(() => {});
  const [zoom, setZoom] = useState(DEFAULT_CAMERA.zoom);

  useEffect(() => {
    const host = shell.current!;
    const content = world.current!;
    let frame = 0;
    let layoutTimer = 0;
    let storeTimer = 0;
    let autoFit = false;
    let bounds: Bounds = { x: 0, y: 0, width: 1, height: 1 };
    const pointers = new Map<number, { x: number; y: number }>();
    const captures = new Map<number, Element>();
    let previous: { x: number; y: number; distance: number } | null = null;
    let nativeGestureScale = 1;
    let nativeGestureActive = false;
    let spaceHeld = false;
    let spaceOwned = false;
    let altHeld = false;
    let suppressPanClick = false;
    const forcedPointers = new Set<number>();
    const storage = () => window.localStorage;
    try {
      const kept = readCamera(storage());
      if (kept) camera.current = kept;
      else autoFit = true;
    } catch {
      autoFit = true;
    }

    const paint = () => {
      frame = 0;
      const { x, y, zoom } = camera.current;
      content.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      host.dataset.zoom = String(zoom);
      setZoom(zoom);
    };
    const update = (next: Camera) => {
      const valid = cameraOf(next);
      if (!valid) return;
      camera.current = valid;
      if (!frame) frame = requestAnimationFrame(paint);
      window.clearTimeout(storeTimer);
      storeTimer = window.setTimeout(() => {
        try {
          saveCamera(storage(), camera.current);
        } catch {
          /* Storage is optional. */
        }
      }, 180);
    };
    move.current = (next) => {
      autoFit = false;
      update(next);
    };
    fit.current = () => move.current(fitCamera(bounds, host.clientWidth, host.clientHeight));
    const measure = () => {
      // Natural grid flow prevents overlap. offset bounds include each title and its padding;
      // there are no containment placeholders or synthetic group positions.
      const groups = [...content.querySelectorAll<HTMLElement>("[data-canvas-group]")];
      bounds = {
        x: 0,
        y: 0,
        width: Math.max(1, ...groups.map((g) => g.offsetLeft + g.offsetWidth)),
        height: Math.max(1, ...groups.map((g) => g.offsetTop + g.offsetHeight)),
      };
      if (autoFit) update(fitCamera(bounds, host.clientWidth, host.clientHeight));
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(layoutTimer);
      layoutTimer = window.setTimeout(measure, 120);
    });
    observer.observe(host);
    observer.observe(content);
    for (const group of content.querySelectorAll("[data-canvas-group]")) observer.observe(group);
    paint();
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(measure, 120);

    const userMove = (next: Camera) => {
      autoFit = false;
      move.current(next);
    };
    const clear = () => {
      for (const [id, element] of captures) {
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      }
      captures.clear();
      pointers.clear();
      forcedPointers.clear();
      previous = null;
      nativeGestureScale = 1;
      nativeGestureActive = false;
      spaceHeld = false;
      spaceOwned = false;
      altHeld = false;
      suppressPanClick = false;
      host.dataset.panReady = "false";
      host.dataset.panning = "false";
    };
    const metrics = () => {
      const points = [...pointers.values()];
      if (!points.length) return null;
      const a = points[0]!;
      const b = points[1] ?? a;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const down = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.button !== 0) return;
      suppressPanClick = false;
      const empty = event.target.closest("[data-canvas-space]");
      const forced = spaceHeld || altHeld || (event.altKey && content.contains(event.target));
      if (!empty && !forced) return;
      if (event.target.closest("[data-canvas-controls]")) return;
      if (forced) {
        // Consume only this explicit pan gesture before the preview receives its press.
        event.preventDefault();
        event.stopPropagation();
        forcedPointers.add(event.pointerId);
        suppressPanClick = true;
        if (spaceHeld) spaceOwned = true;
      }
      host.focus({ preventScroll: true });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const owner = forced ? host : event.target;
      owner.setPointerCapture(event.pointerId);
      captures.set(event.pointerId, owner);
      previous = metrics();
      host.dataset.panning = "true";
      autoFit = false;
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      if (forcedPointers.has(event.pointerId)) event.stopPropagation();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = metrics();
      if (next && previous) {
        const rect = host.getBoundingClientRect();
        let updated = {
          ...camera.current,
          x: camera.current.x + next.x - previous.x,
          y: camera.current.y + next.y - previous.y,
        };
        if (next.distance > 0 && previous.distance > 0)
          updated = zoomAt(
            updated,
            next.x - rect.left,
            next.y - rect.top,
            next.distance / previous.distance,
          );
        userMove(updated);
      }
      previous = next;
    };
    const up = (event: PointerEvent) => {
      if (forcedPointers.delete(event.pointerId)) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.type === "pointercancel") suppressPanClick = false;
      const element = captures.get(event.pointerId);
      captures.delete(event.pointerId);
      pointers.delete(event.pointerId);
      if (element?.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      previous = metrics();
      if (!pointers.size) host.dataset.panning = "false";
    };
    const wheel = (event: WheelEvent) => {
      const zooming = event.ctrlKey || event.metaKey;
      // Browser zoom belongs to the camera, including over previews, controls and portals.
      // A group's frame and ordinary components do not stop trackpad panning. Only an
      // actual scrollable viewport keeps the gesture, along the axes it can scroll.
      if (!zooming) {
        if (
          !(event.target instanceof Element) ||
          !host.contains(event.target) ||
          event.target.closest(
            '[data-canvas-controls], select, input[type="number"], input[type="range"]',
          )
        )
          return;
        for (
          let node: Element | null = event.target;
          node && node !== host;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            (event.deltaY !== 0 &&
              /^(auto|scroll)$/.test(style.overflowY) &&
              node.scrollHeight > node.clientHeight) ||
            (event.deltaX !== 0 &&
              /^(auto|scroll)$/.test(style.overflowX) &&
              node.scrollWidth > node.clientWidth)
          )
            return;
        }
      }
      event.preventDefault();
      // Safari may emit wheel events alongside its native gesture events.
      if (zooming && nativeGestureActive) return;
      const rect = host.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1;
      if (zooming)
        userMove(
          zoomAt(
            camera.current,
            event.clientX - rect.left,
            event.clientY - rect.top,
            Math.exp(-event.deltaY * delta * 0.01),
          ),
        );
      else
        userMove({
          ...camera.current,
          x: camera.current.x - event.deltaX * delta,
          y: camera.current.y - event.deltaY * delta,
        });
    };
    const browserZoomKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (!["+", "=", "-", "_", "0"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "0") userMove({ ...DEFAULT_CAMERA });
      else
        userMove(
          zoomAt(
            camera.current,
            host.clientWidth / 2,
            host.clientHeight / 2,
            event.key === "-" || event.key === "_" ? 1 / 1.2 : 1.2,
          ),
        );
    };
    // Safari's trackpad uses gesture events. Touch pointers on empty space already implement
    // the camera pinch, so that case must not apply the same scale twice.
    const gestureStart = (event: Event) => {
      event.preventDefault();
      nativeGestureActive = true;
      nativeGestureScale = 1;
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const { scale, clientX, clientY } = event as Event & {
        scale?: number;
        clientX?: number;
        clientY?: number;
      };
      if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return;
      if (pointers.size < 2) {
        const rect = host.getBoundingClientRect();
        userMove(
          zoomAt(
            camera.current,
            typeof clientX === "number" ? clientX - rect.left : host.clientWidth / 2,
            typeof clientY === "number" ? clientY - rect.top : host.clientHeight / 2,
            scale / nativeGestureScale,
          ),
        );
      }
      nativeGestureScale = scale;
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      nativeGestureActive = false;
      nativeGestureScale = 1;
    };
    const panKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target !== document.body && !host.contains(event.target)) return;
      if (event.key === "Alt" && !event.ctrlKey && !event.metaKey) {
        altHeld = true;
        host.dataset.panReady = "true";
        return;
      }
      if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
      // Observe Space over previews without consuming their keyboard activation. Only an
      // explicit pointer press turns it into a canvas gesture. Text editors keep Space alone.
      if (
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="searchbox"]',
        ) ||
        event.isComposing
      )
        return;
      spaceHeld = true;
      if (event.target === host || event.target === document.body) {
        event.preventDefault();
        spaceOwned = true;
        host.dataset.panReady = "true";
      }
    };
    const panKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        altHeld = false;
        host.dataset.panReady = String(spaceOwned);
        return;
      }
      if (event.key !== " " || !spaceHeld) return;
      if (spaceOwned) event.preventDefault();
      spaceHeld = false;
      spaceOwned = false;
      host.dataset.panReady = String(altHeld);
    };
    const key = (event: KeyboardEvent) => {
      if (event.target !== host || event.ctrlKey || event.metaKey || event.altKey) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [80, 0],
        ArrowRight: [-80, 0],
        ArrowUp: [0, 80],
        ArrowDown: [0, -80],
      };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        userMove({
          ...camera.current,
          x: camera.current.x + direction[0],
          y: camera.current.y + direction[1],
        });
      }
      if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        userMove(
          zoomAt(
            camera.current,
            host.clientWidth / 2,
            host.clientHeight / 2,
            event.key === "-" ? 1 / 1.2 : 1.2,
          ),
        );
      }
      if (event.key === "Home") {
        event.preventDefault();
        autoFit = false;
        fit.current();
      }
      if (event.key === "Escape") clear();
      // Undo and all preview editing shortcuts remain native.
    };
    const reveal = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !content.contains(event.target)) return;
      autoFit = false;
      const rect = event.target.getBoundingClientRect();
      const viewport = host.getBoundingClientRect();
      const dx =
        rect.left < viewport.left + 24
          ? viewport.left + 24 - rect.left
          : rect.right > viewport.right - 24
            ? viewport.right - 24 - rect.right
            : 0;
      const dy =
        rect.top < viewport.top + 80
          ? viewport.top + 80 - rect.top
          : rect.bottom > viewport.bottom - 24
            ? viewport.bottom - 24 - rect.bottom
            : 0;
      if (dx || dy)
        userMove({ ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy });
      host.scrollTop = 0;
      host.scrollLeft = 0;
    };
    const navigate = (event: MouseEvent) => {
      if (suppressPanClick) {
        suppressPanClick = false;
        if (event.detail > 0) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      const href = link.getAttribute("href")!;
      let id = "";
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin && url.pathname === location.pathname)
          id = decodeURIComponent(url.hash.slice(1));
      } catch {
        /* A malformed preview link stays here too. */
      }
      const group = [...content.querySelectorAll<HTMLElement>("[data-canvas-group]")].find(
        (node) => node.id === id,
      );
      if (group)
        userMove({
          ...camera.current,
          x: 32 - group.offsetLeft * camera.current.zoom,
          y: 80 - group.offsetTop * camera.current.zoom,
        });
      else toast("Preview link", { description: href });
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointermove", pointerMove, true);
    host.addEventListener("pointerup", up, true);
    host.addEventListener("pointercancel", up, true);
    host.addEventListener("lostpointercapture", up);
    document.addEventListener("wheel", wheel, { passive: false, capture: true });
    document.addEventListener("keydown", browserZoomKey, true);
    document.addEventListener("keydown", panKeyDown, true);
    document.addEventListener("keyup", panKeyUp, true);
    document.addEventListener("gesturestart", gestureStart, { passive: false });
    document.addEventListener("gesturechange", gestureChange, { passive: false });
    document.addEventListener("gestureend", gestureEnd, { passive: false });
    host.addEventListener("keydown", key);
    document.addEventListener("focusin", reveal);
    document.addEventListener("click", navigate, true);
    document.addEventListener("auxclick", navigate, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(layoutTimer);
      window.clearTimeout(storeTimer);
      try {
        saveCamera(storage(), camera.current);
      } catch {
        /* Storage is optional. */
      }
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointermove", pointerMove, true);
      host.removeEventListener("pointerup", up, true);
      host.removeEventListener("pointercancel", up, true);
      host.removeEventListener("lostpointercapture", up);
      document.removeEventListener("wheel", wheel, true);
      document.removeEventListener("keydown", browserZoomKey, true);
      document.removeEventListener("keydown", panKeyDown, true);
      document.removeEventListener("keyup", panKeyUp, true);
      document.removeEventListener("gesturestart", gestureStart);
      document.removeEventListener("gesturechange", gestureChange);
      document.removeEventListener("gestureend", gestureEnd);
      host.removeEventListener("keydown", key);
      document.removeEventListener("focusin", reveal);
      document.removeEventListener("click", navigate, true);
      document.removeEventListener("auxclick", navigate, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
    };
  }, []);

  function zoomBy(factor: number) {
    const host = shell.current!;
    move.current(zoomAt(camera.current, host.clientWidth / 2, host.clientHeight / 2, factor));
  }

  return (
    <div
      ref={shell}
      role="region"
      aria-label="Design system canvas"
      aria-describedby="canvas-keys"
      tabIndex={0}
      className="fixed inset-0 overflow-hidden overscroll-none bg-background text-foreground [touch-action:pan-x_pan-y] focus-visible:outline-(--focus-ring-outline) focus-visible:-outline-offset-2"
    >
      <p id="canvas-keys" className="sr-only">
        Pan on empty space, or hold Alt or Option and drag over a component. Space and drag also
        pans, including after focusing a component, except while editing text. Trackpad scrolling
        pans over groups and components; scrollable previews keep their own scrolling.
        Control-scroll zooms around the pointer. On the canvas, use arrows to pan, plus and minus to
        zoom, and Home to fit all. Control or Command with plus and minus also zooms the canvas, and
        with zero resets its camera. Preview controls keep their own editing keys. Preview links
        stay here.
      </p>
      <div
        data-canvas-space
        className="absolute inset-0 cursor-grab touch-none in-data-[pan-ready=true]:z-40 in-data-[panning=true]:z-40 in-data-[panning=true]:cursor-grabbing"
      />
      <div
        data-canvas-controls
        className="absolute top-xs right-xs z-50 flex max-w-[calc(100%-var(--space-m))] flex-wrap items-center justify-end gap-xs rounded-(--radius-s) bg-background p-xs shadow-s"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
        >
          <MinusIcon aria-hidden />
        </Button>
        <output className="w-12 text-center text-s tabular-nums" aria-label="Canvas zoom">
          {Math.round(zoom * 100)}%
        </output>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
          <PlusIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit all components"
          onClick={() => fit.current()}
        >
          <MaximizeIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset camera"
          onClick={() => {
            try {
              localStorage.removeItem(CAMERA_KEY);
            } catch {
              /* Storage is optional. */
            }
            move.current({ ...DEFAULT_CAMERA });
          }}
        >
          <RestartIcon aria-hidden />
        </Button>
        <ThemeToggle label="Switch between light and dark" />
      </div>
      <div
        ref={world}
        data-canvas-world
        className="pointer-events-none absolute top-0 left-0 flex w-max items-start gap-xxl origin-top-left"
      >
        <Samples />
      </div>
    </div>
  );
}
