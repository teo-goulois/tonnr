"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type React from "react";
import { cn } from "@repo/ui/lib/utils";

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

export function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props): React.ReactElement {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogClose({ ...props }: DialogPrimitive.Close.Props): React.ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/**
 * Centered modal surface. Bundles Portal + Backdrop + Popup so callers only
 * deal with the content. Pair with a controlled <Dialog open onOpenChange>.
 */
export function DialogPopup({
  children,
  className,
  backdropClassName,
  portalProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  portalProps?: DialogPrimitive.Portal.Props;
  /** Extra classes for the backdrop — e.g. a stronger blur or scrim. */
  backdropClassName?: string;
}): React.ReactElement {
  return (
    <DialogPrimitive.Portal {...portalProps}>
      <DialogPrimitive.Backdrop
        className={cn(
          // structure & layout
          "fixed inset-0 z-50",
          // border & background
          "bg-neutral-10-transparent",
          // transitions
          "transition-opacity duration-200",
          // state: ending
          "data-ending-style:opacity-0",
          // state: starting
          "data-starting-style:opacity-0",
          backdropClassName,
        )}
        data-slot="dialog-backdrop"
      />
      <DialogPrimitive.Popup
        className={cn(
          // structure & layout
          "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex",
          // sizing & spacing
          "max-h-[85vh] w-[min(48rem,calc(100vw-2rem))]",
          // structure & layout
          "origin-center flex-col overflow-y-auto rounded-2xl",
          // border & background
          "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)] [--edge-elevation:var(--shadow-l)]",
          // typography
          "text-popover-foreground",
          // shadow
          // outline / ring (focus)
          "outline-none",
          // transitions
          "transition-[opacity,scale] duration-200 ease-out",
          // state: ending
          "data-ending-style:scale-98 data-ending-style:opacity-0",
          // state: starting
          "data-starting-style:scale-98 data-starting-style:opacity-0",
          className,
        )}
        data-slot="dialog-popup"
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props): React.ReactElement {
  return (
    <DialogPrimitive.Title
      className={cn("text-l font-medium", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props): React.ReactElement {
  return (
    <DialogPrimitive.Description
      className={cn("text-m text-neutral-7", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export { DialogPrimitive, DialogPopup as DialogContent };
