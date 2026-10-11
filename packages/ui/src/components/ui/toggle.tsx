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
          mark too, and not by its color alone. The mark has its room from the start, so that
          pressing moves nothing. */}
      {variant === "outline" && (
        <CheckIcon
          aria-hidden
          data-slot="toggle-check"
          className="-ml-0.5 size-3! opacity-0 group-data-pressed/toggle:opacity-100"
        />
      )}
      {children}
    </TogglePrimitive>
  );
}

export { TogglePrimitive };
