"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { CheckIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";

// From the teogoulois registry, on the Tonnr theme: a toggle is a pill, as the theme's small
// controls are, and one that is pressed takes the theme's ink, as its primary button does.
export const toggleVariants = cva(
  [
    // structure & layout
    "group/toggle relative inline-flex shrink-0 items-center justify-center rounded-full",
    // cursor & interaction
    "cursor-pointer select-none",
    // typography
    "font-medium whitespace-nowrap text-neutral-10",
    // transitions
    "transition-[color,background-color,box-shadow] duration-(--motion-duration) ease-theme",
    "motion-reduce:transition-none focus-visible:transition-none",
    // focus
    "focus-ring outline-none",
    // a finger gets the room it needs, which the layout then keeps for it
    "pointer-coarse:min-h-11 pointer-coarse:min-w-11",
    // state: disabled
    "disabled:pointer-events-none disabled:text-neutral-6",
    // nested icon svg
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 min-w-9 gap-xs px-s text-m",
        sm: "h-8 min-w-8 gap-xxs px-s text-s",
      },
      variant: {
        default: "hover:bg-neutral-3-transparent data-pressed:bg-neutral-3",
        outline: [
          "edge-inset [--edge-color:var(--neutral-4)]",
          "hover:bg-neutral-3-transparent",
          "data-pressed:bg-color-1 data-pressed:text-neutral-1 data-pressed:[--edge-color:var(--color-1)]",
          "disabled:[--edge-color:var(--neutral-4-transparent)]",
        ],
      },
    },
  },
);

export function Toggle({
  className,
  variant,
  size,
  children,
  ...props
}: Omit<TogglePrimitive.Props, "children"> &
  VariantProps<typeof toggleVariants> & { children?: React.ReactNode }): React.ReactElement {
  return (
    <TogglePrimitive
      className={cn(toggleVariants({ className, size, variant }))}
      data-slot="toggle"
      {...props}
    >
      {/* An outlined toggle is a word to press among others: one that is pressed says so with a
          mark too. An unpressed toggle leaves no room for the mark. */}
      {variant === "outline" && (
        <span
          aria-hidden
          data-slot="toggle-check-slot"
          className={cn(
            "inline-flex w-0 shrink-0 items-center opacity-0",
            "transition-[width,margin-inline-start,margin-inline-end,opacity] duration-(--motion-duration) ease-theme",
            "group-data-pressed/toggle:-ms-0.5 group-data-pressed/toggle:w-3 group-data-pressed/toggle:me-0 group-data-pressed/toggle:opacity-100",
            "motion-reduce:transition-none group-focus-visible/toggle:transition-none",
            size === "sm" ? "-me-xxs" : "-me-xs",
          )}
        >
          <CheckIcon
            data-slot="toggle-check"
            className="size-3! scale-(--motion-popup-scale) transition-transform duration-(--motion-duration) ease-theme group-data-pressed/toggle:scale-100 motion-reduce:transform-none motion-reduce:transition-none group-focus-visible/toggle:transform-none group-focus-visible/toggle:transition-none"
          />
        </span>
      )}
      {children}
    </TogglePrimitive>
  );
}

export { TogglePrimitive };
