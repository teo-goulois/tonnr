import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "edge focus-ring flex field-sizing-content min-h-16 w-full resize-none rounded-xs bg-neutral-1 px-s py-xs text-m text-neutral-10 transition-[box-shadow,background-color] duration-(--motion-duration) ease-theme outline-none [--edge-color:var(--neutral-4)] placeholder:text-neutral-6 hover:[--edge-color:var(--neutral-5)] focus-visible:[--edge-color:var(--color-1-transparent)] disabled:bg-neutral-3 disabled:text-neutral-6 disabled:[--edge-color:var(--neutral-4-transparent)] aria-invalid:[--edge-color:var(--error)]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
