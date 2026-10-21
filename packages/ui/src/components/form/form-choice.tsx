"use client";

// The adapter of `ToggleGroup`, written on the registry's model (decision 076): the words a field
// holds, several with `multiple` or one. The group is named by its label and described by its
// description or its error. A group that is invalid gives its first toggle the focus on submit.

import { ToggleGroup } from "@repo/ui/components/ui/toggle-group";
import type { toggleVariants } from "@repo/ui/components/ui/toggle";
import type { VariantProps } from "class-variance-authority";
import { useId, type ReactNode } from "react";

import { getFieldError, useFieldContext, useInvalidShake } from "../../hooks/form/form-context";
import { FormFieldMessage } from "./form-field-message";

export type FormChoiceProps = VariantProps<typeof toggleVariants> & {
  label?: ReactNode;
  description?: ReactNode;
  // Several toggles pressed at once: the field holds them all. Otherwise it holds the one pressed,
  // or none.
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  // The toggles, `ToggleGroupItem`s whose values are the field's words.
  children: ReactNode;
};

export function FormChoice({
  description,
  label,
  multiple = false,
  disabled,
  className,
  variant = "outline",
  size = "sm",
  children,
}: FormChoiceProps) {
  const field = useFieldContext<string[] | string | null>();
  const generatedId = useId().replaceAll(":", "");
  const groupId = `form-choice-${generatedId}`;
  const labelId = label ? `${groupId}-label` : undefined;
  const descriptionId = description ? `${groupId}-description` : undefined;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const error = isInvalid ? getFieldError(field.state.meta.errors[0]) : undefined;
  const errorId = error ? `${groupId}-error` : undefined;
  const describedBy = [error ? undefined : descriptionId, errorId].filter(Boolean).join(" ");
  const controlRef = useInvalidShake(isInvalid);
  const value = field.state.value;
  const pressed = Array.isArray(value) ? value : value === null ? [] : [value];

  return (
    <div
      className="grid min-w-0 gap-xs"
      data-invalid={isInvalid || undefined}
      data-slot="form-field"
    >
      {label ? (
        <p id={labelId} className="text-m font-medium text-neutral-10">
          {label}
        </p>
      ) : null}
      <div ref={controlRef} data-slot="form-control">
        <ToggleGroup
          id={groupId}
          multiple={multiple}
          variant={variant}
          size={size}
          disabled={disabled}
          className={className}
          aria-labelledby={labelId}
          aria-describedby={describedBy || undefined}
          aria-invalid={isInvalid || undefined}
          value={pressed}
          onValueChange={(next) => {
            const words = next as string[];
            field.handleChange(multiple ? words : (words[0] ?? null));
            field.handleBlur();
          }}
        >
          {children}
        </ToggleGroup>
      </div>
      <FormFieldMessage
        description={description}
        descriptionId={descriptionId}
        error={error}
        errorId={errorId}
      />
    </div>
  );
}
