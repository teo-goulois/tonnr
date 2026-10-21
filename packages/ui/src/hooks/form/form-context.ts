"use client";

// From the teogoulois registry (`form`), as it is: the contexts every adapter reads, the light
// shake of a field that becomes invalid, and how an error is read. Decision 076.

import { createFormHookContexts } from "@tanstack/react-form";
import { useEffect, useRef } from "react";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

export function shakeInvalidElement(element: HTMLElement | null) {
  if (
    !element ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof element.animate !== "function"
  ) {
    return;
  }

  return element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(-1px)" },
      { transform: "translateX(0)" },
    ],
    {
      duration: 300,
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    },
  );
}

export function useInvalidShake(isInvalid: boolean) {
  const controlRef = useRef<HTMLDivElement>(null);
  const wasInvalidRef = useRef(false);

  useEffect(() => {
    const becameInvalid = isInvalid && !wasInvalidRef.current;
    wasInvalidRef.current = isInvalid;

    if (!becameInvalid) return;

    const animation = shakeInvalidElement(controlRef.current);
    return () => animation?.cancel();
  }, [isInvalid]);

  return controlRef;
}

export function getFieldError(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return error == null ? undefined : String(error);
}
