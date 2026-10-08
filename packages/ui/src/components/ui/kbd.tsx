import { cn } from "@repo/ui/lib/utils";
import type * as React from "react";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        // cursor & interaction
        "pointer-events-none",
        // structure & layout
        "inline-flex",
        // sizing & spacing
        "h-5 min-w-5",
        // cursor & interaction
        "select-none",
        // structure & layout
        "items-center justify-center",
        // sizing & spacing
        "gap-xxs",
        // structure & layout
        "rounded-xs",
        // border & background
        "bg-muted",
        // sizing & spacing
        "px-xxs",
        // typography
        "font-medium font-sans text-muted-foreground text-xs",
        // nested icon svg
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}
