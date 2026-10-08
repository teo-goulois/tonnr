"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronRightIcon } from "@repo/ui/icon";
import type * as React from "react";
import { cn } from "@repo/ui/lib/utils";

export const MenuCreateHandle: typeof MenuPrimitive.createHandle = MenuPrimitive.createHandle;

export const Menu: typeof MenuPrimitive.Root = MenuPrimitive.Root;

export const MenuPortal: typeof MenuPrimitive.Portal = MenuPrimitive.Portal;

export function MenuTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.Trigger.Props): React.ReactElement {
  return (
    <MenuPrimitive.Trigger className={className} data-slot="menu-trigger" {...props}>
      {children}
    </MenuPrimitive.Trigger>
  );
}

export function MenuPopup({
  children,
  className,
  sideOffset = 4,
  align = "center",
  alignOffset,
  side = "bottom",
  anchor,
  portalProps,
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
  side?: MenuPrimitive.Positioner.Props["side"];
  anchor?: MenuPrimitive.Positioner.Props["anchor"];
  portalProps?: MenuPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <MenuPortal {...portalProps}>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50"
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            // structure & layout
            "relative flex",
            // sizing & spacing
            "not-[class*='w-']:min-w-32",
            // animation
            "origin-(--transform-origin)",
            // structure & layout
            "rounded-m",
            // border & background
            "edge bg-neutral-1 [--edge-color:var(--neutral-4-transparent)] [--edge-elevation:var(--shadow-m)]",
            // outline / ring (focus)
            "outline-none",
            // pseudo-element
            "before:pointer-events-none before:absolute before:inset-0",
            // outline / ring (focus)
            "focus:outline-none",
            className,
          )}
          data-slot="menu-popup"
          {...props}
        >
          <div className="max-h-(--available-height) w-full overflow-y-auto p-xxs">{children}</div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPortal>
  );
}

export function MenuGroup(props: MenuPrimitive.Group.Props): React.ReactElement {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />;
}

export function MenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <MenuPrimitive.Item
      className={cn(
        // structure & layout
        "flex min-h-8",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center",
        // typography
        "text-m text-neutral-10",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent",
        // state: inset
        "data-inset:ps-8",
        // state: destructive
        "data-[variant=destructive]:text-error",
        // state: highlighted
        "data-highlighted:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        // nested icon svg
        "[&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&>svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0",
        // structure & layout
        "group/row w-full items-center gap-xs rounded-xs",
        // sizing & spacing
        "px-xs py-xxs",
        // typography
        "text-left text-m font-medium text-neutral-7",
        // transitions
        "transition-colors",
        // state: hover
        "hover:bg-accent hover:text-accent-foreground",
        // outline / ring (focus)
        "focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
        className,
      )}
      data-inset={inset}
      data-slot="menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

export function MenuLinkItem({
  className,
  inset,
  variant = "default",
  closeOnClick = true,
  ...props
}: MenuPrimitive.LinkItem.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <MenuPrimitive.LinkItem
      className={cn(
        // structure & layout
        "flex min-h-8",
        // cursor & interaction
        "cursor-default select-none",
        // structure & layout
        "items-center gap-xs rounded-xs",
        // sizing & spacing
        "px-xs py-xxs",
        // typography
        "text-m text-neutral-10",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent",
        // state: inset
        "data-inset:ps-8",
        // state: destructive
        "data-[variant=destructive]:text-error",
        // state: highlighted
        "data-highlighted:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        // nested icon svg
        "[&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&>svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0",
        className,
      )}
      closeOnClick={closeOnClick}
      data-inset={inset}
      data-slot="menu-link-item"
      data-variant={variant}
      {...props}
    />
  );
}

export function MenuCheckboxItem({
  className,
  children,
  checked,
  variant = "default",
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  variant?: "default" | "switch";
}): React.ReactElement {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        // structure & layout
        "grid min-h-8",
        // state: side=none
        "in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)]",
        // cursor & interaction
        "cursor-default",
        // structure & layout
        "items-center gap-xs rounded-xs",
        // sizing & spacing
        "py-xxs ps-xs",
        // typography
        "text-m text-neutral-10",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        // nested icon svg
        "[&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "switch" ? "grid-cols-[1fr_auto] gap-4 pe-1.5" : "grid-cols-[.75rem_1fr] pe-4",
        className,
      )}
      data-slot="menu-checkbox-item"
      {...props}
    >
      {variant === "switch" ? (
        <>
          <span className="col-start-1">{children}</span>
          <MenuPrimitive.CheckboxItemIndicator
            className={cn(
              // shadow
              "inset-shadow-[0_1px_--theme(--color-black/4%)]",
              // structure & layout
              "inline-flex",
              // sizing & spacing
              "h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)]",
              // structure & layout
              "shrink-0 items-center rounded-full",
              // sizing & spacing
              "p-px",
              // outline / ring (focus)
              "outline-none",
              // transitions
              "transition-[background-color,box-shadow] duration-200",
              // sizing & spacing
              "[--thumb-size:--spacing(4)]",
              // outline / ring (focus)
              "focus-visible:ring-2 focus-visible:ring-ring",
              "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              // state: checked
              "data-checked:bg-primary",
              // state: unchecked
              "data-unchecked:bg-input",
              // state: disabled
              "data-disabled:text-neutral-6",
              // responsive
              "sm:[--thumb-size:--spacing(3)]",
            )}
            keepMounted
          >
            <span
              className={cn(
                // cursor & interaction
                "pointer-events-none",
                // structure & layout
                "block aspect-square h-full",
                // state: checked
                "in-[[data-slot=menu-checkbox-item][data-checked]]:origin-[var(--thumb-size)_50%]",
                // animation
                "origin-left",
                // state: checked
                "in-[[data-slot=menu-checkbox-item][data-checked]]:translate-x-[calc(var(--thumb-size)-4px)]",
                // state: active
                "in-[[data-slot=menu-checkbox-item]:active]:not-data-disabled:scale-x-110",
                "in-[[data-slot=menu-checkbox-item]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.10)]",
                // structure & layout
                "rounded-(--thumb-size)",
                // border & background
                "bg-background",
                // shadow
                "shadow-sm/5",
                // transitions
                "will-change-transform",
                "[transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s]",
              )}
            />
          </MenuPrimitive.CheckboxItemIndicator>
        </>
      ) : (
        <>
          <MenuPrimitive.CheckboxItemIndicator className="col-start-1 -ms-0.5">
            <svg
              aria-hidden="true"
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
            </svg>
          </MenuPrimitive.CheckboxItemIndicator>
          <span className="col-start-2">{children}</span>
        </>
      )}
    </MenuPrimitive.CheckboxItem>
  );
}

export function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props): React.ReactElement {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />;
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: MenuPrimitive.RadioItem.Props): React.ReactElement {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        // structure & layout
        "grid min-h-8",
        // state: side=none
        "in-data-[side=none]:min-w-[calc(var(--anchor-width)+1.25rem)]",
        // cursor & interaction
        "cursor-default",
        // structure & layout
        "grid-cols-[.75rem_1fr] items-center gap-xs rounded-xs",
        // sizing & spacing
        "py-xxs ps-xs",
        // typography
        "text-m text-neutral-10",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        // nested icon svg
        "[&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        // structure & layout
        "group/row flex w-full items-center gap-xs rounded-xs",
        // sizing & spacing
        "px-xs py-xxs",
        // typography
        "text-left text-m font-medium text-neutral-7",
        // transitions
        "transition-colors",
        // state: hover
        "hover:bg-accent hover:text-accent-foreground",
        // state: checked
        "data-checked:text-accent-foreground",
        // outline / ring (focus)
        "focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
        className,
      )}
      data-slot="menu-radio-item"
      {...props}
    >
      <span className="col-start-1 w-full">{children}</span>
      <MenuPrimitive.RadioItemIndicator className="col-start-2">
        <svg
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function MenuGroupLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}): React.ReactElement {
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        // sizing & spacing
        "px-xs py-xxs",
        // typography
        "text-m font-medium text-neutral-6",
        // state: inset
        "data-inset:ps-9",
        // responsive
        "sm:data-inset:ps-8",
        className,
      )}
      data-inset={inset}
      data-slot="menu-label"
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props): React.ReactElement {
  return (
    <MenuPrimitive.Separator
      className={cn("mx-xs my-xxs h-(--border-s) bg-neutral-4", className)}
      data-slot="menu-separator"
      {...props}
    />
  );
}

export function MenuShortcut({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "ms-auto font-medium font-sans text-neutral-6 text-xs tracking-widest",
        className,
      )}
      data-slot="menu-shortcut"
      {...props}
    />
  );
}

export function MenuSub(props: MenuPrimitive.SubmenuRoot.Props): React.ReactElement {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />;
}

export function MenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}): React.ReactElement {
  return (
    <MenuPrimitive.SubmenuTrigger
      className={cn(
        // structure & layout
        "flex min-h-8 items-center gap-xs rounded-xs",
        // sizing & spacing
        "px-xs py-xxs",
        // typography
        "text-m text-neutral-10",
        // outline / ring (focus)
        "outline-none",
        // state: disabled
        "data-disabled:pointer-events-none",
        // state: highlighted
        "data-highlighted:bg-accent",
        // state: open
        "data-popup-open:bg-accent",
        // state: inset
        "data-inset:ps-8",
        // state: highlighted
        "data-highlighted:text-accent-foreground",
        // state: open
        "data-popup-open:text-accent-foreground",
        // state: disabled
        "data-disabled:text-neutral-6",
        // nested icon svg
        "[&>svg:not(:last-child)]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5",
        // responsive
        "sm:[&_svg:not([class*='size-'])]:size-4",
        // nested icon svg
        "[&_svg]:pointer-events-none",
        className,
      )}
      data-inset={inset}
      data-slot="menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto -me-0.5 opacity-80" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function MenuSubPopup({
  className,
  sideOffset = 0,
  alignOffset,
  align = "start",
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
}): React.ReactElement {
  const defaultAlignOffset = align !== "center" ? -5 : undefined;

  return (
    <MenuPopup
      align={align}
      alignOffset={alignOffset ?? defaultAlignOffset}
      className={className}
      data-slot="menu-sub-content"
      side="inline-end"
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export {
  MenuPrimitive,
  MenuCreateHandle as DropdownMenuCreateHandle,
  Menu as DropdownMenu,
  MenuPortal as DropdownMenuPortal,
  MenuTrigger as DropdownMenuTrigger,
  MenuPopup as DropdownMenuContent,
  MenuGroup as DropdownMenuGroup,
  MenuItem as DropdownMenuItem,
  MenuLinkItem as DropdownMenuLinkItem,
  MenuCheckboxItem as DropdownMenuCheckboxItem,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem as DropdownMenuRadioItem,
  MenuGroupLabel as DropdownMenuLabel,
  MenuSeparator as DropdownMenuSeparator,
  MenuShortcut as DropdownMenuShortcut,
  MenuSub as DropdownMenuSub,
  MenuSubTrigger as DropdownMenuSubTrigger,
  MenuSubPopup as DropdownMenuSubContent,
};
