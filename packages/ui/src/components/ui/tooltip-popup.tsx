"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type React from "react";
import { cn } from "@repo/ui/lib/utils";

export const TooltipCreateHandle: typeof TooltipPrimitive.createHandle =
  TooltipPrimitive.createHandle;

export const TooltipProvider: typeof TooltipPrimitive.Provider = TooltipPrimitive.Provider;

export const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

export function TooltipTrigger(props: TooltipPrimitive.Trigger.Props): React.ReactElement {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipPopup({
  className,
  align = "center",
  sideOffset = 8,
  side = "top",
  anchor,
  children,
  portalProps,
  ...props
}: TooltipPrimitive.Popup.Props & {
  align?: TooltipPrimitive.Positioner.Props["align"];
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
  anchor?: TooltipPrimitive.Positioner.Props["anchor"];
  portalProps?: TooltipPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <TooltipPrimitive.Portal {...portalProps}>
      <TooltipPrimitive.Positioner
        align={align}
        anchor={anchor}
        className={cn(
          // structure & layout
          "z-50",
          // sizing & spacing
          "h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)",
          // transitions
          "transition-[top,left,right,bottom,transform] duration-(--motion-duration) ease-theme",
          // state: instant
          "data-instant:transition-none",
        )}
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(
            // structure & layout
            "relative flex",
            // sizing & spacing
            "h-(--popup-height,auto) w-(--popup-width,auto)",
            // animation
            "origin-(--transform-origin)",
            // Tooltip colors, spacing and radius follow the Tonnr theme.
            "rounded-(--radius-s) bg-neutral-10 text-m font-medium text-neutral-1 shadow-s",
            "text-pretty transition-[width,height,scale,opacity] duration-(--motion-duration) ease-theme",
            "data-ending-style:scale-(--motion-popup-scale) data-starting-style:scale-(--motion-popup-scale)",
            "data-ending-style:opacity-0 data-starting-style:opacity-0",
            "data-instant:duration-0",
            className,
          )}
          data-slot="tooltip-popup"
          {...props}
        >
          <TooltipPrimitive.Viewport
            className={cn(
              // structure & layout
              "relative",
              // sizing & spacing
              "size-full",
              // structure & layout
              "overflow-clip",
              // sizing & spacing
              "px-(--viewport-inline-padding) py-xxs [--viewport-inline-padding:var(--space-xs)]",
              // state: instant
              "data-instant:transition-none",
              // nested: data-current / data-previous — state: ending / starting
              "**:data-current:data-ending-style:opacity-0",
              "**:data-current:data-starting-style:opacity-0",
              "**:data-previous:data-ending-style:opacity-0",
              "**:data-previous:data-starting-style:opacity-0",
              // nested: data-current / data-previous — sizing & spacing
              "**:data-current:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding))]",
              "**:data-previous:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding))]",
              // nested: data-previous — typography
              "**:data-previous:truncate",
              // nested: data-current / data-previous
              "**:data-current:opacity-100 **:data-previous:opacity-100",
              // nested: data-current / data-previous — transitions
              "**:data-current:transition-opacity **:data-previous:transition-opacity",
            )}
            data-slot="tooltip-viewport"
          >
            {children}
          </TooltipPrimitive.Viewport>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { TooltipPrimitive, TooltipPopup as TooltipContent };
