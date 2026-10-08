import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@repo/ui/lib/utils";
import * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "edge focus-ring w-full min-w-0 rounded-(--radius-s) bg-neutral-1 px-s py-xs text-m text-neutral-10 transition-[box-shadow,background-color] duration-(--motion-duration) ease-theme outline-none [--edge-color:var(--neutral-4)] file:border-0 file:bg-transparent file:text-m file:font-medium file:text-neutral-10 placeholder:text-neutral-6 hover:[--edge-color:var(--neutral-5)] focus-visible:[--edge-color:var(--color-1-transparent)] disabled:pointer-events-none disabled:bg-neutral-3 disabled:text-neutral-6 disabled:[--edge-color:var(--neutral-4-transparent)] aria-invalid:[--edge-color:var(--error)]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
