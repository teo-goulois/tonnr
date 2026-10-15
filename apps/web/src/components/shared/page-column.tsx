import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";

/**
 * A page of one column, such as the sign-in or where the link of a mail lands: centered in the
 * screen while it fits, and scrolled from its top when it does not. It keeps clear of the header
 * that floats over a wide screen and of a phone's bar of tabs, by `--app-header-lift` and
 * `--bottom-nav-lift`.
 */
export function PageColumn({ className, children, ...props }: ComponentProps<"main">) {
  return (
    <main
      className="grid min-h-0 overflow-y-auto px-m pt-[calc(var(--spacing-xl)+var(--app-header-lift,0px))] pb-[calc(var(--spacing-xl)+var(--bottom-nav-lift,0px))]"
      {...props}
    >
      {/* Auto margins center the column, and fall to nothing once it is taller than the screen,
          so that its top is never out of reach. */}
      <div
        className={cn("m-auto grid w-full max-w-(--container-sm) content-start gap-l", className)}
      >
        {children}
      </div>
    </main>
  );
}
