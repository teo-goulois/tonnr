"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@repo/ui/lib/utils";
import { cva } from "class-variance-authority";
import type * as React from "react";

const inputControlVariants = cva("", {
  variants: {
    unstyled: {
      false: [
        // Follows the Text field assignments of the Tonnr theme.
        // structure & layout
        "edge relative inline-flex w-full rounded-(--radius-s)",
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
      true: "",
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const inputVariants = cva(
  [
    // sizing & spacing
    "w-full min-w-0 px-s py-xs",
    // structure & layout
    "rounded-[inherit] bg-transparent",
    // outline / ring (focus)
    "outline-none",
    // autofill keeps the control's own background
    "[transition:background-color_5000000s_ease-in-out_0s]",
    // pseudo-element
    "placeholder:text-neutral-6",
  ],
  {
    variants: {
      size: {
        default: "",
        sm: "px-xs py-xxs text-s",
        lg: "px-m py-s",
      },
      type: {
        file: [
          // typography
          "text-neutral-7",
          // pseudo-element
          "file:me-xs file:bg-transparent file:font-medium file:text-neutral-10 file:text-m",
        ],
        search: [
          // pseudo-element
          "[&::-webkit-search-cancel-button]:appearance-none",
          "[&::-webkit-search-decoration]:appearance-none",
          "[&::-webkit-search-results-button]:appearance-none",
          "[&::-webkit-search-results-decoration]:appearance-none",
        ],
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

function getInputTypeVariant(type: InputProps["type"]): "file" | "search" | undefined {
  if (type === "file") {
    return "file";
  }

  if (type === "search") {
    return "search";
  }

  return undefined;
}

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps): React.ReactElement {
  const variantSize = typeof size === "number" ? undefined : size;
  const inputClassName = inputVariants({
    size: variantSize,
    type: getInputTypeVariant(props.type),
  });

  const inputControlClassName = cn(inputControlVariants({ unstyled }), className);

  return (
    <span className={inputControlClassName || undefined} data-size={size} data-slot="input-control">
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={style}
          {...props}
        />
      )}
    </span>
  );
}

export { InputPrimitive, inputControlVariants, inputVariants };
