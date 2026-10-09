"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";
import { cn } from "@repo/ui/lib/utils";

type SliderProps = SliderPrimitive.Root.Props &
  // What a screen reader says of a thumb: its name, and its value in words.
  Pick<SliderPrimitive.Thumb.Props, "getAriaLabel" | "getAriaValueText">;

// Colors, edges and radius follow the Slider assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The geometry is the registry's.
export function Slider({
  className,
  children,
  defaultValue,
  value,
  min = 0,
  max = 100,
  getAriaLabel,
  getAriaValueText,
  ...props
}: SliderProps): React.ReactElement {
  const _values = React.useMemo(() => {
    if (value !== undefined) {
      return Array.isArray(value) ? value : [value];
    }
    if (defaultValue !== undefined) {
      return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
    }
    return [min];
  }, [value, defaultValue, min]);

  return (
    <SliderPrimitive.Root
      className={cn("data-[orientation=horizontal]:w-full", className)}
      defaultValue={defaultValue}
      max={max}
      min={min}
      thumbAlignment="edge"
      value={value}
      {...props}
    >
      {children}
      <SliderPrimitive.Control
        className={cn(
          // structure & layout
          "flex",
          // cursor & interaction
          "cursor-pointer touch-none select-none",
          // state: disabled
          "data-disabled:pointer-events-none",
          // state: vertical orientation
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44",
          "data-[orientation=vertical]:flex-col",
          // state: horizontal orientation
          "data-[orientation=horizontal]:w-full data-[orientation=horizontal]:py-2",
        )}
        data-slot="slider-control"
      >
        <SliderPrimitive.Track
          className={cn(
            // structure & layout
            "relative grow",
            // cursor & interaction
            "select-none",
            // pseudo-element
            "before:absolute before:rounded-full before:bg-neutral-3",
            // state: horizontal / vertical orientation
            "data-[orientation=horizontal]:h-1 data-[orientation=vertical]:h-full",
            "data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-1",
            // state: horizontal / vertical orientation — pseudo-element
            "data-[orientation=horizontal]:before:inset-0",
            "data-[orientation=vertical]:before:inset-0",
          )}
          data-slot="slider-track"
        >
          <SliderPrimitive.Indicator
            className={cn(
              // cursor & interaction
              "select-none",
              // structure & layout
              "rounded-full",
              // border & background
              "bg-color-1",
              // state: disabled
              "data-disabled:bg-neutral-5",
            )}
            data-slot="slider-indicator"
          />
          {Array.from({ length: _values.length }, (_, index) => (
            <SliderPrimitive.Thumb
              className={cn(
                // structure & layout
                "block shrink-0 rounded-full",
                // sizing & spacing
                "size-5",
                // cursor & interaction
                "select-none",
                // border & background
                "edge bg-neutral-1 [--edge-color:var(--color-1)]",
                "[--edge-elevation:var(--shadow-s)]",
                // focus
                "outline-none has-focus-visible:[outline:var(--focus-ring-outline)]",
                "has-focus-visible:outline-offset-2",
                // transitions
                "transition-[scale] duration-(--motion-duration) ease-theme",
                // state: dragging
                "data-dragging:scale-120",
                // state: disabled
                "data-disabled:bg-neutral-2 data-disabled:[--edge-color:var(--neutral-5-transparent)]",
                "data-disabled:[--edge-elevation:0_0_#0000]",
                // responsive
                "sm:size-4",
              )}
              data-slot="slider-thumb"
              getAriaLabel={getAriaLabel}
              getAriaValueText={getAriaValueText}
              index={index}
              key={String(index)}
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export function SliderValue({
  className,
  ...props
}: SliderPrimitive.Value.Props): React.ReactElement {
  return (
    <SliderPrimitive.Value
      className={cn("flex justify-end text-m text-neutral-7", className)}
      data-slot="slider-value"
      {...props}
    />
  );
}

export { SliderPrimitive };
