"use client";

// From the teogoulois registry (`form`), on the Tonnr theme: the adapter of `Input`. It binds the
// field and owns the label, the description, the error and their ARIA links. Decision 076.

import { Input, type InputProps } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useId, type ReactNode } from "react";

import { getFieldError, useFieldContext, useInvalidShake } from "../../hooks/form/form-context";
import { FormFieldMessage } from "./form-field-message";

export type FormInputProps = Omit<
  InputProps,
  "aria-invalid" | "defaultValue" | "name" | "onBlur" | "onChange" | "value"
> & {
  label?: ReactNode;
  description?: ReactNode;
};

export function FormInput({
  "aria-describedby": ariaDescribedBy,
  description,
  id,
  label,
  ...props
}: FormInputProps) {
  const field = useFieldContext<string>();
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `form-input-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const error = isInvalid ? getFieldError(field.state.meta.errors[0]) : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, error ? undefined : descriptionId, errorId]
    .filter(Boolean)
    .join(" ");
  const controlRef = useInvalidShake(isInvalid);

  return (
    <div
      className="grid min-w-0 gap-xs"
      data-invalid={isInvalid || undefined}
      data-slot="form-field"
    >
      {label ? (
        <Label htmlFor={inputId} data-invalid={isInvalid || undefined}>
          {label}
        </Label>
      ) : null}
      <div ref={controlRef} data-slot="form-control">
        <Input
          {...props}
          id={inputId}
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
          aria-describedby={describedBy || undefined}
          aria-invalid={isInvalid || undefined}
        />
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
