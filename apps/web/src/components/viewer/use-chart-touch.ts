import { useEffect, useState } from "react";

// A hold reads the curve; moving before it starts belongs to the browser's scrolling.
export const CHART_HOLD_MS = 300;
const SCROLL_SLOP = 8;

export function useChartTouch({
  start,
  end,
  left = 0,
  right = 0,
  enabled = true,
  samples,
}: {
  start: number;
  end: number;
  left?: number;
  right?: number;
  enabled?: boolean;
  samples?: readonly { time: number }[];
}) {
  const [element, ref] = useState<HTMLElement | null>(null);
  const [time, setTime] = useState<number>();
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setTime(undefined);
    if (!element || !enabled) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let origin: { x: number; y: number; id: number } | undefined;
    let active = false;
    let clientX = 0;

    const read = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const width = box.width - left - right;
      if (width <= 0) return;
      const fraction = Math.max(0, Math.min(1, (clientX - box.left - left) / width));
      const next = start + fraction * (end - start);
      setTime(samples ? nearestChartPoint(samples, next)?.time : next);
    };
    const reset = () => {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      frame = 0;
      origin = undefined;
      active = false;
      setTime(undefined);
    };
    const begin = (event: TouchEvent) => {
      reset();
      setIsTouch(true);
      if (event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      origin = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
      clientX = touch.clientX;
      hold = setTimeout(() => {
        active = true;
        read();
      }, CHART_HOLD_MS);
    };
    const move = (event: TouchEvent) => {
      if (!origin) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch?.identifier !== origin.id) {
        reset();
        return;
      }
      if (!active) {
        if (Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > SCROLL_SLOP) reset();
        return;
      }
      // A non-passive listener is needed on Safari. Only an established hold owns the
      // gesture: ordinary scrolling and pinch zoom are never prevented.
      if (!event.cancelable) {
        reset();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clientX = touch.clientX;
      if (!frame) frame = requestAnimationFrame(read);
    };
    const contextMenu = (event: Event) => {
      if (origin) event.preventDefault();
    };
    const mouse = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setIsTouch(false);
    };
    element.addEventListener("pointermove", mouse);
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", reset);
    element.addEventListener("touchcancel", reset);
    element.addEventListener("contextmenu", contextMenu);
    window.addEventListener("blur", reset);
    return () => {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", mouse);
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", reset);
      element.removeEventListener("touchcancel", reset);
      element.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", reset);
    };
  }, [element, enabled, start, end, left, right, samples]);

  // Observe input modality only; Recharts keeps its own keyboard navigation.
  return { ref, time, isTouch, onKeyDownCapture: () => setIsTouch(false) };
}

export function nearestChartPoint<T extends { time: number }>(
  rows: readonly T[],
  time: number | undefined,
) {
  if (time === undefined) return undefined;
  return rows.reduce<T | undefined>(
    (nearest, row) =>
      !nearest || Math.abs(row.time - time) < Math.abs(nearest.time - time) ? row : nearest,
    undefined,
  );
}
