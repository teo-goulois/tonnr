"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type React from "react";
import { cn } from "@repo/ui/lib/utils";

// Colors, edge, radius and padding follow the Popover assignments of the Tonnr theme, in
// gui/themes/tonnr-components.md. The geometry and the motion are the registry's.
export const PopoverCreateHandle: typeof PopoverPrimitive.createHandle =
  PopoverPrimitive.createHandle;

export const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

export function PopoverTrigger({
  className,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props): React.ReactElement {
  return (
    <PopoverPrimitive.Trigger className={className} data-slot="popover-trigger" {...props}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

export function PopoverPopup({
  children,
  className,
  side = "bottom",
  align = "center",
  sideOffset = 4,
  alignOffset = 0,
  anchor,
  portalProps,
  ...props
}: PopoverPrimitive.Popup.Props & {
  portalProps?: PopoverPrimitive.Portal.Props;
  side?: PopoverPrimitive.Positioner.Props["side"];
  align?: PopoverPrimitive.Positioner.Props["align"];
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"];
  anchor?: PopoverPrimitive.Positioner.Props["anchor"];
}): React.ReactElement {
  return (
    <PopoverPrimitive.Portal {...portalProps}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 max-w-(--available-width)"
        data-slot="popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            // structure & layout
            "relative flex flex-col gap-xs",
            // sizing & spacing
            "max-h-(--available-height) overflow-y-auto p-m",
            // animation
            "origin-(--transform-origin)",
            // structure & layout
            "rounded-m",
            // border & background
            "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)] [--edge-elevation:var(--shadow-m)]",
            // typography
            "text-m text-neutral-10",
            // outline / ring (focus)
            "outline-none",
            // transitions
            "transition-[scale,opacity] duration-(--motion-duration) ease-theme",
            // state: starting and ending style
            "data-starting-style:scale-(--motion-popup-scale) data-starting-style:opacity-0",
            "data-ending-style:scale-(--motion-popup-scale) data-ending-style:opacity-0",
            className,
          )}
          data-slot="popover-popup"
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export function PopoverClose({ ...props }: PopoverPrimitive.Close.Props): React.ReactElement {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export function PopoverTitle({
  className,
  ...props
}: PopoverPrimitive.Title.Props): React.ReactElement {
  return (
    <PopoverPrimitive.Title
      className={cn("text-m font-medium", className)}
      data-slot="popover-title"
      {...props}
    />
  );
}

export function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props): React.ReactElement {
  return (
    <PopoverPrimitive.Description
      className={cn("text-m text-neutral-7", className)}
      data-slot="popover-description"
      {...props}
    />
  );
}

export { PopoverPrimitive, PopoverPopup as PopoverContent };
