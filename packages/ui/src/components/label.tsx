"use client";

import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-xs text-m font-medium text-neutral-10 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-neutral-6 peer-disabled:text-neutral-6",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
