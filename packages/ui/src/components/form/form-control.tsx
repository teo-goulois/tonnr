"use client";

// The adapter of a control that an app draws itself, written on the registry's model (decision
// 076): a rating, sizes chosen among pictures, a few cards to pick from. The control knows no form
// library. This adapter binds it to the field and owns its label, its description, its error and
// their ARIA links, which it hands the control with its value: the control is named by
// `aria-labelledby` and described by `aria-describedby`, since a label points at one element. A
// control that two forms use gets an adapter of its own instead, in the app's `useAppForm`.

import { useId, type ReactNode } from "react";

import { getFieldError, useFieldContext, useInvalidShake } from "../../hooks/form/form-context";
import { FormFieldMessage } from "./form-field-message";

/** What the control is given: its value, what changes it, and what names and describes it. */
export type FormControlBinding<T> = {
  id: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  onBlur: () => void;
  invalid: boolean;
  "aria-labelledby": string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

export type FormControlProps<T> = {
  label?: ReactNode;
  description?: ReactNode;
  // How the label stands: over the control, or beside it on the same line.
  layout?: "stacked" | "inline";
  className?: string;
  children: (control: FormControlBinding<T>) => ReactNode;
};

export function FormControl<T>({
  description,
  label,
  layout = "stacked",
  className,
  children,
}: FormControlProps<T>) {
  const field = useFieldContext<T>();
  const generatedId = useId().replaceAll(":", "");
  const controlId = `form-control-${generatedId}`;
  const labelId = label ? `${controlId}-label` : undefined;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
  const error = isInvalid ? getFieldError(field.state.meta.errors[0]) : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [error ? undefined : descriptionId, errorId].filter(Boolean).join(" ");
  const controlRef = useInvalidShake(isInvalid);

  const control = (
    <div ref={controlRef} data-slot="form-control" className="min-w-0">
      {children({
        id: controlId,
        name: field.name,
        value: field.state.value,
        onChange: (value) => field.handleChange(value),
        onBlur: field.handleBlur,
        invalid: isInvalid,
        "aria-labelledby": labelId,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": isInvalid || undefined,
      })}
    </div>
  );

  return (
    <div
      className={className ?? "grid min-w-0 gap-xs"}
      data-invalid={isInvalid || undefined}
      data-slot="form-field"
    >
      {layout === "inline" ? (
        <div className="flex min-w-0 items-center justify-between gap-s">
          {label ? (
            <span id={labelId} className="shrink-0">
              {label}
            </span>
          ) : null}
          {control}
        </div>
      ) : (
        <>
          {label ? (
            <p id={labelId} className="text-m font-medium text-neutral-10">
              {label}
            </p>
          ) : null}
          {control}
        </>
      )}
      <FormFieldMessage
        description={description}
        descriptionId={descriptionId}
        error={error}
        errorId={errorId}
      />
    </div>
  );
}
