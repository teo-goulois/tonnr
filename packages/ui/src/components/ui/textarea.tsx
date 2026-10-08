"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import type * as React from "react";
import { cn } from "@repo/ui/lib/utils";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> &
  React.RefAttributes<HTMLTextAreaElement> & {
    size?: "sm" | "default" | "lg" | number;
    unstyled?: boolean;
  };

export function Textarea({
  className,
  size = "default",
  unstyled = false,
  ref,
  ...props
}: TextareaProps): React.ReactElement {
  return (
    <span
      className={
        cn(
          !unstyled && [
            // Follows the Text field assignments of the Tonnr theme.
            // structure & layout
            "edge relative inline-flex w-full rounded-xs",
            // background & typography
            "bg-neutral-1 text-m text-neutral-10",
            // edge
            "[--edge-color:var(--neutral-4)] hover:[--edge-color:var(--neutral-5)]",
            // transitions
            "transition-[box-shadow,background-color] duration-(--motion-duration) ease-theme",
            // state: focus-within
            "has-focus-visible:[--edge-color:var(--color-1-transparent)]",
            "has-focus-visible:[outline:var(--focus-ring-outline)] has-focus-visible:outline-offset-2",
            // state: invalid
            "has-aria-invalid:[--edge-color:var(--error)]",
            // state: disabled
            "has-disabled:bg-neutral-3 has-disabled:text-neutral-6",
            "has-disabled:[--edge-color:var(--neutral-4-transparent)]",
          ],
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="textarea-control"
    >
      <FieldPrimitive.Control
        ref={ref}
        value={props.value}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        render={(defaultProps: React.ComponentProps<"textarea">) => (
          <textarea
            className={cn(
              // sizing & spacing
              "field-sizing-content min-h-17.5 w-full",
              // structure & layout
              "rounded-[inherit]",
              // sizing & spacing
              "bg-transparent px-s py-xs placeholder:text-neutral-6",
              // outline / ring (focus)
              "outline-none",
              // responsive
              "max-sm:min-h-20.5",
              size === "sm" && [
                // sizing & spacing
                "min-h-16.5 px-xs py-xxs text-s",
                // responsive
                "max-sm:min-h-19.5",
              ],
              size === "lg" && "min-h-18.5 px-m py-s max-sm:min-h-21.5",
            )}
            data-slot="textarea"
            {...mergeProps(defaultProps, props)}
          />
        )}
      />
    </span>
  );
}

export { FieldPrimitive };
