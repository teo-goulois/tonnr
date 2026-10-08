"use client";

import { Dialog as CommandDialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon } from "@repo/ui/icon";
import type * as React from "react";
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteSeparator,
} from "@repo/ui/components/ui/autocomplete";
import { cn } from "@repo/ui/lib/utils";

export const CommandDialog: typeof CommandDialogPrimitive.Root = CommandDialogPrimitive.Root;

export const CommandDialogPortal: typeof CommandDialogPrimitive.Portal =
  CommandDialogPrimitive.Portal;

export const CommandCreateHandle: typeof CommandDialogPrimitive.createHandle =
  CommandDialogPrimitive.createHandle;

export function CommandDialogTrigger(
  props: CommandDialogPrimitive.Trigger.Props,
): React.ReactElement {
  return <CommandDialogPrimitive.Trigger data-slot="command-dialog-trigger" {...props} />;
}

export function CommandDialogBackdrop({
  className,
  ...props
}: CommandDialogPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <CommandDialogPrimitive.Backdrop
      className={cn(
        // structure & layout
        "fixed inset-0 z-50",
        // border & background
        "bg-neutral-10-transparent",
        // transitions
        "transition-all duration-200",
        // state: ending
        "data-ending-style:opacity-0",
        // state: starting
        "data-starting-style:opacity-0",
        className,
      )}
      data-slot="command-dialog-backdrop"
      {...props}
    />
  );
}

export function CommandDialogViewport({
  className,
  ...props
}: CommandDialogPrimitive.Viewport.Props): React.ReactElement {
  return (
    <CommandDialogPrimitive.Viewport
      className={cn(
        // structure & layout
        "fixed inset-0 z-50 flex flex-col items-center",
        // sizing & spacing
        "px-4 py-[max(--spacing(4),4vh)]",
        // responsive
        "sm:py-[10vh]",
        className,
      )}
      data-slot="command-dialog-viewport"
      {...props}
    />
  );
}

export function CommandDialogPopup({
  className,
  children,
  portalProps,
  ...props
}: CommandDialogPrimitive.Popup.Props & {
  portalProps?: CommandDialogPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <CommandDialogPortal {...portalProps}>
      <CommandDialogBackdrop />
      <CommandDialogViewport>
        <CommandDialogPrimitive.Popup
          className={cn(
            // structure & layout
            "relative row-start-2 flex",
            // sizing & spacing
            "max-h-105 min-h-0 w-full min-w-0 max-w-(--container-xl)",
            // animation
            "-translate-y-[calc(1.25rem*var(--nested-dialogs))]",
            "scale-[calc(1-0.1*var(--nested-dialogs))]",
            // structure & layout
            "flex-col rounded-2xl",
            // border & background
            "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)] [--edge-elevation:var(--shadow-l)]",
            // typography
            "text-popover-foreground",
            // animation
            "opacity-[calc(1-0.1*var(--nested-dialogs))]",
            // shadow
            // outline / ring (focus)
            "outline-none",
            // transitions
            "transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform",
            // pseudo-element
            "before:pointer-events-none before:absolute before:inset-0",
            "before:rounded-[calc(var(--radius-2xl)-1px)] before:bg-muted/72",
            // shadow
            // state: nested ending
            "data-nested:data-ending-style:translate-y-8",
            // state: nested starting
            "data-nested:data-starting-style:translate-y-8",
            // state: nested dialog open
            "data-nested-dialog-open:origin-top",
            // state: ending
            "data-ending-style:scale-98",
            // state: starting
            "data-starting-style:scale-98",
            // state: ending
            "data-ending-style:opacity-0",
            // state: starting
            "data-starting-style:opacity-0",
            // nested: data-slot=scroll-area-viewport
            "**:data-[slot=scroll-area-viewport]:data-has-overflow-y:pe-1",
            // dark mode
            className,
          )}
          data-slot="command-dialog-popup"
          {...props}
        >
          {children}
        </CommandDialogPrimitive.Popup>
      </CommandDialogViewport>
    </CommandDialogPortal>
  );
}

export function Command({
  autoHighlight = "always",
  keepHighlight = true,
  ...props
}: React.ComponentProps<typeof Autocomplete>): React.ReactElement {
  return (
    <Autocomplete
      autoHighlight={autoHighlight}
      inline
      keepHighlight={keepHighlight}
      open
      {...props}
    />
  );
}

export function CommandInput({
  className,
  placeholder = undefined,
  ...props
}: React.ComponentProps<typeof AutocompleteInput>): React.ReactElement {
  return (
    <div className="px-2.5 py-1.5">
      <AutocompleteInput
        autoFocus
        className={cn(
          // border & background
          "border-transparent! bg-transparent!",
          // shadow
          "shadow-none",
          // pseudo-element
          "before:hidden",
          // outline / ring (focus)
          "has-focus-visible:ring-0",
          className,
        )}
        placeholder={placeholder}
        size="lg"
        startAddon={<SearchIcon />}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteList>): React.ReactElement {
  return (
    <AutocompleteList
      className={cn("not-empty:scroll-py-2 not-empty:p-2", className)}
      data-slot="command-list"
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteEmpty>): React.ReactElement {
  return (
    <AutocompleteEmpty
      className={cn("not-empty:py-6", className)}
      data-slot="command-empty"
      {...props}
    />
  );
}

export function CommandPanel({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        // structure & layout
        "relative",
        // sizing & spacing
        "-mx-px",
        // state: no footer
        "not-has-[+[data-slot=command-footer]]:-mb-px",
        // sizing & spacing
        "min-h-0",
        // structure & layout
        "rounded-t-xl",
        // state: no footer
        "not-has-[+[data-slot=command-footer]]:rounded-b-2xl",
        // border & background
        "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)]",
        // shadow
        // structure & layout
        "[clip-path:inset(0_1px)]",
        // state: no footer
        "not-has-[+[data-slot=command-footer]]:[clip-path:inset(0_1px_1px_1px_round_0_0_calc(var(--radius-2xl)-1px)_calc(var(--radius-2xl)-1px))]",
        // pseudo-element
        "before:pointer-events-none before:absolute before:inset-0",
        "before:rounded-t-[calc(var(--radius-xl)-1px)]",
        // nested: data-slot=scroll-area-scrollbar
        "**:data-[slot=scroll-area-scrollbar]:mt-2",
        className,
      )}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroup>): React.ReactElement {
  return <AutocompleteGroup className={className} data-slot="command-group" {...props} />;
}

export function CommandGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroupLabel>): React.ReactElement {
  return (
    <AutocompleteGroupLabel className={className} data-slot="command-group-label" {...props} />
  );
}

export function CommandCollection({
  ...props
}: React.ComponentProps<typeof AutocompleteCollection>): React.ReactElement {
  return <AutocompleteCollection data-slot="command-collection" {...props} />;
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteItem>): React.ReactElement {
  return (
    <AutocompleteItem className={cn("py-1.5", className)} data-slot="command-item" {...props} />
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteSeparator>): React.ReactElement {
  return (
    <AutocompleteSeparator
      className={cn("my-2", className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

export function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "ms-auto font-medium font-sans text-neutral-6 text-xs tracking-widest",
        className,
      )}
      data-slot="command-shortcut"
      {...props}
    />
  );
}

export function CommandFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        // structure & layout
        "flex items-center justify-between",
        // sizing & spacing
        "gap-2",
        // structure & layout
        "rounded-b-[calc(var(--radius-2xl)-1px)]",
        // border & background
        "shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]",
        // sizing & spacing
        "px-5 py-3",
        // typography
        "text-muted-foreground text-xs",
        className,
      )}
      data-slot="command-footer"
      {...props}
    />
  );
}

export { CommandDialogPrimitive };
