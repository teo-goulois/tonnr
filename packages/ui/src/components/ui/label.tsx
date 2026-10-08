import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        // structure & layout
        "flex items-center",
        // sizing & spacing
        "gap-xs",
        // typography
        "text-m font-medium text-neutral-10",
        // cursor & interaction
        "select-none",
        // state: group-disabled
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-neutral-6",
        // state: peer-disabled
        "peer-disabled:cursor-not-allowed peer-disabled:text-neutral-6",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
