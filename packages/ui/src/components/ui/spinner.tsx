import type React from "react";
import { LoaderIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof LoaderIcon>): React.ReactElement {
  return (
    <LoaderIcon
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
