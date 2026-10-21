"use client";

// From the teogoulois registry (`form`), on the Tonnr theme: the adapter of `Textarea`.
// Decision 076.

import { Label } from "@repo/ui/components/ui/label";
import { Textarea, type TextareaProps } from "@repo/ui/components/ui/textarea";
import { useId, type ReactNode } from "react";

import { getFieldError, useFieldContext, useInvalidShake } from "../../hooks/form/form-context";
import { FormFieldMessage } from "./form-field-message";

export type FormTextareaProps = Omit<
  TextareaProps,
  "aria-invalid" | "defaultValue" | "name" | "onBlur" | "onChange" | "value"
> & {
  label?: ReactNode;
  description?: ReactNode;
};

export function FormTextarea({
  "aria-describedby": ariaDescribedBy,
  description,
  id,
  label,
  ...props
}: FormTextareaProps) {
  const field = useFieldContext<string>();
  const generatedId = useId().replaceAll(":", "");
  const textareaId = id ?? `form-textarea-${generatedId}`;
  const descriptionId = description ? `${textareaId}-description` : undefined;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const error = isInvalid ? getFieldError(field.state.meta.errors[0]) : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
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
        <Label htmlFor={textareaId} data-invalid={isInvalid || undefined}>
          {label}
        </Label>
      ) : null}
      <div ref={controlRef} data-slot="form-control">
        <Textarea
          {...props}
          id={textareaId}
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
