"use client";

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { ChevronsUpDownIcon, XIcon } from "@repo/ui/icon";
import type React from "react";
import { Input } from "@repo/ui/components/ui/input";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { cn } from "@repo/ui/lib/utils";

export const Autocomplete: typeof AutocompletePrimitive.Root = AutocompletePrimitive.Root;

export function AutocompleteInput({
  className,
  showTrigger = false,
  showClear = false,
  startAddon,
  size,
  triggerProps,
  clearProps,
  ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> & {
  showTrigger?: boolean;
  showClear?: boolean;
  startAddon?: React.ReactNode;
  size?: "sm" | "default" | "lg" | number;
  ref?: React.Ref<HTMLInputElement>;
  triggerProps?: AutocompletePrimitive.Trigger.Props;
  clearProps?: AutocompletePrimitive.Clear.Props;
}): React.ReactElement {
  const sizeValue = (size ?? "default") as "sm" | "default" | "lg" | number;

  return (
    <AutocompletePrimitive.InputGroup
      className={cn(
        // structure & layout
        "relative",
        // state: no full-width child
        "not-has-[>*.w-full]:w-fit",
        // sizing & spacing
        "w-full",
        // typography
        "text-foreground",
        // state: disabled
        "has-disabled:opacity-64",
      )}
      data-slot="autocomplete-input-group"
    >
      {startAddon && (
        <div
          aria-hidden="true"
          className={cn(
            // cursor & interaction
            "pointer-events-none",
            // structure & layout
            "absolute inset-y-0 start-px z-10 flex items-center",
            // sizing & spacing
            "ps-[calc(--spacing(3)-1px)]",
            "opacity-80",
            // state: sm size
            "has-[+[data-size=sm]]:ps-[calc(--spacing(2.5)-1px)]",
            // nested icon svg
            "[&_svg:not([class*='size-'])]:size-4.5",
            // responsive
            "sm:[&_svg:not([class*='size-'])]:size-4",
            // nested icon svg
            "[&_svg]:-mx-0.5",
          )}
          data-slot="autocomplete-start-addon"
        >
          {startAddon}
        </div>
      )}
      <AutocompletePrimitive.Input
        className={cn(
          startAddon && [
            // nested: data-slot=autocomplete-input
            "data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7.5)-1px)]",
            "*:data-[slot=autocomplete-input]:ps-[calc(--spacing(8.5)-1px)]",
            // responsive
            "sm:data-[size=sm]:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(7)-1px)]",
            "sm:*:data-[slot=autocomplete-input]:ps-[calc(--spacing(8)-1px)]",
          ],
          sizeValue === "sm"
            ? "has-[+[data-slot=autocomplete-trigger],+[data-slot=autocomplete-clear]]:*:data-[slot=autocomplete-input]:pe-6.5"
            : "has-[+[data-slot=autocomplete-trigger],+[data-slot=autocomplete-clear]]:*:data-[slot=autocomplete-input]:pe-7",
          className,
        )}
        data-slot="autocomplete-input"
        render={<Input nativeInput size={sizeValue} />}
        {...props}
      />
      {showTrigger && (
        <AutocompleteTrigger
          className={cn(
            // structure & layout
            "absolute top-1/2 inline-flex",
            // sizing & spacing
            "size-8",
            // structure & layout
            "shrink-0 -translate-y-1/2",
            // cursor & interaction
            "cursor-pointer",
            // structure & layout
            "items-center justify-center rounded-md",
            // border & background
            "border border-transparent",
            "opacity-80",
            // outline / ring (focus)
            "outline-none",
            // transitions
            "transition-colors",
            // pseudo-element
            "pointer-coarse:after:absolute pointer-coarse:after:min-h-11",
            "pointer-coarse:after:min-w-11",
            // state: hover
            "hover:opacity-100",
            // state: has clear
            "has-[+[data-slot=autocomplete-clear]]:hidden",
            // responsive
            "sm:size-7",
            // nested icon svg
            "[&_svg:not([class*='size-'])]:size-4.5",
            // responsive
            "sm:[&_svg:not([class*='size-'])]:size-4",
            // nested icon svg
            "[&_svg]:pointer-events-none [&_svg]:shrink-0",
            sizeValue === "sm" ? "end-0" : "end-0.5",
          )}
          {...triggerProps}
        >
          <AutocompletePrimitive.Icon data-slot="autocomplete-icon">
            <ChevronsUpDownIcon />
          </AutocompletePrimitive.Icon>
        </AutocompleteTrigger>
      )}
      {showClear && (
        <AutocompleteClear
          className={cn(
            // structure & layout
            "absolute top-1/2 inline-flex",
            // sizing & spacing
            "size-8",
            // structure & layout
            "shrink-0 -translate-y-1/2",
            // cursor & interaction
            "cursor-pointer",
            // structure & layout
            "items-center justify-center rounded-md",
            // border & background
            "border border-transparent",
            "opacity-80",
            // outline / ring (focus)
            "outline-none",
            // transitions
            "transition-colors",
            // pseudo-element
            "pointer-coarse:after:absolute pointer-coarse:after:min-h-11",
            "pointer-coarse:after:min-w-11",
            // state: hover
            "hover:opacity-100",
            // state: has clear
            "has-[+[data-slot=autocomplete-clear]]:hidden",
            // responsive
            "sm:size-7",
            // nested icon svg
            "[&_svg:not([class*='size-'])]:size-4.5",
            // responsive
            "sm:[&_svg:not([class*='size-'])]:size-4",
            // nested icon svg
            "[&_svg]:pointer-events-none [&_svg]:shrink-0",
            sizeValue === "sm" ? "end-0" : "end-0.5",
          )}
          {...clearProps}
        >
          <XIcon />
        </AutocompleteClear>
      )}
    </AutocompletePrimitive.InputGroup>
  );
}

export function AutocompletePopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  align = "start",
  anchor,
  portalProps,
  ...props
}: AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"];
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"];
  alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"];
  side?: AutocompletePrimitive.Positioner.Props["side"];
  anchor?: AutocompletePrimitive.Positioner.Props["anchor"];
  portalProps?: AutocompletePrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <AutocompletePrimitive.Portal {...portalProps}>
      <AutocompletePrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 select-none"
        data-slot="autocomplete-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <span
          className={cn(
            // structure & layout
            "relative flex",
            // sizing & spacing
            "max-h-full min-w-(--anchor-width) max-w-(--available-width)",
            // structure & layout
            "origin-(--transform-origin) rounded-lg",
            // border & background
            "border bg-popover not-dark:bg-clip-padding",
            // shadow
            "shadow-lg/5",
            // transitions
            "transition-[scale,opacity]",
            // pseudo-element
            "before:pointer-events-none before:absolute before:inset-0",
            "before:rounded-[calc(var(--radius-lg)-1px)]",
            // shadow
            "before:shadow-[0_1px_--theme(--color-black/4%)]",
            // dark mode
            "dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
            className,
          )}
        >
          <AutocompletePrimitive.Popup
            className="flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col text-foreground"
            data-slot="autocomplete-popup"
            {...props}
          >
            {children}
          </AutocompletePrimitive.Popup>
        </span>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}

export function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Item
      className={cn(
        // structure & layout
        "flex",
        // sizing & spacing
        "min-h-8",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center rounded-sm",
        // sizing & spacing
        "px-2 py-1",
        // typography
        "text-m",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        className,
      )}
      data-slot="autocomplete-item"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

export function AutocompleteSeparator({
  className,
  ...props
}: AutocompletePrimitive.Separator.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Separator
      className={cn("mx-2 my-1 h-px bg-border last:hidden", className)}
      data-slot="autocomplete-separator"
      {...props}
    />
  );
}

export function AutocompleteGroup({
  className,
  ...props
}: AutocompletePrimitive.Group.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Group
      className={cn("[[role=group]+&]:mt-1.5", className)}
      data-slot="autocomplete-group"
      {...props}
    />
  );
}

export function AutocompleteGroupLabel({
  className,
  ...props
}: AutocompletePrimitive.GroupLabel.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.GroupLabel
      className={cn("px-2 py-1.5 font-medium text-muted-foreground text-xs", className)}
      data-slot="autocomplete-group-label"
      {...props}
    />
  );
}

export function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Empty
      className={cn("not-empty:p-2 text-center text-m text-neutral-7", className)}
      data-slot="autocomplete-empty"
      {...props}
    />
  );
}

export function AutocompleteRow({
  className,
  ...props
}: AutocompletePrimitive.Row.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Row className={className} data-slot="autocomplete-row" {...props} />
  );
}

export function AutocompleteValue({
  ...props
}: AutocompletePrimitive.Value.Props): React.ReactElement {
  return <AutocompletePrimitive.Value data-slot="autocomplete-value" {...props} />;
}

export function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props): React.ReactElement {
  return (
    <ScrollArea scrollbarGutter scrollFade>
      <AutocompletePrimitive.List
        className={cn("not-empty:scroll-py-1 not-empty:p-1 in-data-has-overflow-y:pe-3", className)}
        data-slot="autocomplete-list"
        {...props}
      />
    </ScrollArea>
  );
}

export function AutocompleteClear({
  className,
  ...props
}: AutocompletePrimitive.Clear.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Clear
      className={cn(
        // structure & layout
        "absolute end-0.5 top-1/2 inline-flex",
        // sizing & spacing
        "size-8",
        // structure & layout
        "shrink-0 -translate-y-1/2",
        // cursor & interaction
        "cursor-pointer",
        // structure & layout
        "items-center justify-center rounded-md",
        // border & background
        "border border-transparent",
        "opacity-80",
        // outline / ring (focus)
        "outline-none",
        // transitions
        "transition-[color,background-color,box-shadow,opacity]",
        // pseudo-element
        "pointer-coarse:after:absolute pointer-coarse:after:min-h-11",
        "pointer-coarse:after:min-w-11",
        // state: hover
        "hover:opacity-100",
        // responsive
        "sm:size-7",
        // nested icon svg
        "[&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="autocomplete-clear"
      {...props}
    >
      <XIcon />
    </AutocompletePrimitive.Clear>
  );
}

export function AutocompleteStatus({
  className,
  ...props
}: AutocompletePrimitive.Status.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Status
      className={cn(
        "px-3 py-2 font-medium text-muted-foreground text-xs empty:m-0 empty:p-0",
        className,
      )}
      data-slot="autocomplete-status"
      {...props}
    />
  );
}

export function AutocompleteCollection({
  ...props
}: AutocompletePrimitive.Collection.Props): React.ReactElement {
  return <AutocompletePrimitive.Collection data-slot="autocomplete-collection" {...props} />;
}

export function AutocompleteTrigger({
  className,
  children,
  ...props
}: AutocompletePrimitive.Trigger.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Trigger
      className={className}
      data-slot="autocomplete-trigger"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Trigger>
  );
}

export const useAutocompleteFilter: typeof AutocompletePrimitive.useFilter =
  AutocompletePrimitive.useFilter;

export { AutocompletePrimitive };
