"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";
import { cn } from "@repo/ui/lib/utils";

// Colors, edges and radius follow the Switch assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The geometry is the registry's.
export function Switch({ className, ...props }: SwitchPrimitive.Root.Props): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // structure & layout
        "inline-flex",
        // sizing & spacing
        "h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)]",
        // structure & layout
        "shrink-0 cursor-pointer items-center rounded-(--radius-s)",
        // sizing & spacing
        "p-px",
        // focus
        "focus-ring outline-none",
        // transitions
        "transition-[background-color,box-shadow] duration-(--motion-duration) ease-theme",
        // sizing & spacing
        "[--thumb-size:--spacing(5)]",
        // state: checked
        "data-checked:bg-color-1",
        // state: unchecked
        "data-unchecked:bg-neutral-4",
        // state: disabled
        "data-disabled:cursor-not-allowed data-disabled:bg-neutral-3",
        // responsive
        "sm:[--thumb-size:--spacing(4)]",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // cursor & interaction
          "pointer-events-none",
          // structure & layout
          "block aspect-square",
          // sizing & spacing
          "h-full",
          // animation
          "origin-left",
          // state: active
          "in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:not-data-disabled:scale-x-110",
          "in-[[role=switch]:active,[data-slot=label]:active,[data-slot=field-label]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.1)]",
          // structure & layout
          "rounded-(--thumb-size)",
          // border & background
          "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)] [--edge-elevation:var(--shadow-s)]",
          // transitions
          "will-change-transform",
          "[transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s]",
          // state: checked
          "data-checked:origin-[var(--thumb-size)_50%]",
          "data-checked:translate-x-[calc(var(--thumb-size)-4px)]",
          // state: disabled
          "data-disabled:bg-neutral-6 data-disabled:[--edge-elevation:0_0_#0000]",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { SwitchPrimitive };
