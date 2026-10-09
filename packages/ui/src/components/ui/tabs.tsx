"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import type React from "react";
import { cn } from "@repo/ui/lib/utils";

// "underline" follows the Tabs assignments of the Tonnr theme, in gui/themes/tonnr-components.md.
// "segment" is not in the theme: the registry's default look, on the theme's neutrals, for a
// choice between two or three views of the same thing.
export type TabsVariant = "underline" | "segment";

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col gap-s data-[orientation=vertical]:flex-row", className)}
      data-slot="tabs"
      {...props}
    />
  );
}

export function TabsList({
  variant = "underline",
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant;
}): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(
        // structure & layout
        "group/tabs-list relative z-0 flex items-center",
        // typography
        "text-neutral-6",
        variant === "underline"
          ? [
              // sizing & spacing
              "gap-l",
              // border & background: a rule under the list, drawn as an edge
              "shadow-[inset_0_calc(-1*var(--border-s))_0_var(--neutral-4)]",
            ]
          : [
              // sizing & spacing
              "w-fit gap-0.5 p-0.5",
              // border & background
              "rounded-full bg-neutral-3",
            ],
        className,
      )}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          // structure & layout
          "absolute bottom-0 left-0",
          // sizing & spacing
          "w-(--active-tab-width)",
          // animation
          "translate-x-(--active-tab-left)",
          // transitions
          "transition-[width,translate] duration-(--motion-duration) ease-theme",
          variant === "underline"
            ? "z-10 h-(--border-m) bg-neutral-10"
            : [
                // structure & layout
                "-z-1 h-(--active-tab-height) -translate-y-(--active-tab-bottom)",
                // border & background
                "edge rounded-full bg-neutral-1 [--edge-color:var(--neutral-10-transparent)]",
              ],
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={cn(
        // structure & layout
        "relative flex shrink-0 items-center justify-center gap-xs",
        // cursor & interaction
        "cursor-pointer",
        // typography
        "whitespace-nowrap",
        // focus
        "focus-ring outline-none",
        // transitions
        "transition-[color] duration-(--motion-duration) ease-theme",
        // state: hover, active
        "hover:text-neutral-10 data-active:text-neutral-10",
        // state: disabled
        "data-disabled:pointer-events-none data-disabled:text-neutral-4",
        // variant: underline
        "group-data-[variant=underline]/tabs-list:py-xs group-data-[variant=underline]/tabs-list:text-m",
        // variant: segment
        "group-data-[variant=segment]/tabs-list:h-6 group-data-[variant=segment]/tabs-list:rounded-full",
        "group-data-[variant=segment]/tabs-list:px-xs group-data-[variant=segment]/tabs-list:text-xs",
        "group-data-[variant=segment]/tabs-list:data-active:font-medium",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { TabsPrimitive, TabsTab as TabsTrigger, TabsPanel as TabsContent };
