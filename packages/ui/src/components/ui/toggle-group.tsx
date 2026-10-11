"use client";

import type { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle as ToggleComponent, type toggleVariants } from "@repo/ui/components/ui/toggle";
import { cn } from "@repo/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

export const ToggleGroupContext: React.Context<VariantProps<typeof toggleVariants>> =
  React.createContext<VariantProps<typeof toggleVariants>>({
    size: "default",
    variant: "default",
  });

/**
 * Toggles that say one thing together: several of them pressed, with `multiple`, or one.
 *
 * From the teogoulois registry, on the Tonnr theme. The registry joins the toggles of an
 * outlined group into one bar, with separators between them. The theme has no such bar: here a
 * group is pills side by side, which go to the next line when the row is full.
 */
export function ToggleGroup({
  className,
  variant = "default",
  size = "default",
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof toggleVariants>): React.ReactElement {
  return (
    <ToggleGroupPrimitive
      className={cn(
        "flex gap-xs *:focus-visible:z-10",
        // A row goes to the next line when it is full. A column keeps its toggles' widths.
        orientation === "horizontal" ? "flex-wrap" : "flex-col items-start",
        className,
      )}
      data-size={size}
      data-slot="toggle-group"
      data-variant={variant}
      orientation={orientation}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>): React.ReactElement {
  const context = React.useContext(ToggleGroupContext);

  const resolvedVariant = context.variant || variant;
  const resolvedSize = context.size || size;

  return (
    <ToggleComponent
      className={className}
      data-size={resolvedSize}
      data-variant={resolvedVariant}
      size={resolvedSize}
      variant={resolvedVariant}
      {...props}
    >
      {children}
    </ToggleComponent>
  );
}

export { ToggleGroupPrimitive };
