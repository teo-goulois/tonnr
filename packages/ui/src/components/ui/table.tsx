import { cn } from "@repo/ui/lib/utils";
import type React from "react";

// The parts are the registry's. The theme assigns nothing to a table, so it takes the
// foundations: the small text step, a muted head, and rules drawn as one-sided inset shadows.
// The registry's card variant is left out until a screen asks for it.
const RULE = "shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)]";

/** A table that scrolls sideways inside its own box when its columns do not fit. */
export function Table({ className, ...props }: React.ComponentProps<"table">): React.ReactElement {
  return (
    <div className="relative w-full overflow-x-auto" data-slot="table-container">
      <table
        className={cn("w-full caption-bottom text-s", className)}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

export function TableHeader(props: React.ComponentProps<"thead">): React.ReactElement {
  return <thead data-slot="table-header" {...props} />;
}

export function TableBody(props: React.ComponentProps<"tbody">): React.ReactElement {
  return <tbody data-slot="table-body" {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">): React.ReactElement {
  return (
    <tr
      className={cn(
        // state: hover, for the rows of the body only
        "in-[tbody]:hover:bg-neutral-2",
        // transitions
        "transition-colors duration-(--motion-duration) ease-theme",
        className,
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">): React.ReactElement {
  return (
    <th
      className={cn(
        // sizing & spacing
        "h-10 px-s",
        // typography
        "text-left align-middle text-xs font-medium whitespace-nowrap text-neutral-7",
        // border
        RULE,
        className,
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">): React.ReactElement {
  return (
    <td
      className={cn(
        // sizing & spacing
        "p-s",
        // typography
        "align-middle",
        // border: every row is ruled but the last
        RULE,
        "in-[tbody>tr:last-child]:shadow-none",
        className,
      )}
      data-slot="table-cell"
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">): React.ReactElement {
  return (
    <caption
      className={cn("mt-s text-s text-neutral-7", className)}
      data-slot="table-caption"
      {...props}
    />
  );
}
