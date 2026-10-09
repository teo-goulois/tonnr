import { Label } from "@repo/ui/components/ui/label";
import type { ReactNode } from "react";

type FieldProps = {
  label: string;
  // What the field is for, when its label cannot say it.
  hint?: string;
  errors?: ({ message?: string } | undefined)[];
  children: (invalid: boolean) => ReactNode;
};

/** A labelled control, with its hint and what is wrong with its value. */
export function Field({ label, hint, errors = [], children }: FieldProps) {
  const messages = errors.flatMap((error) => (error?.message ? [error.message] : []));
  return (
    <Label className="grid gap-xxs">
      {label}
      {children(messages.length > 0)}
      {hint && <span className="text-s font-normal text-neutral-7">{hint}</span>}
      {messages.map((message) => (
        <span key={message} role="alert" className="text-s font-normal text-error">
          {message}
        </span>
      ))}
    </Label>
  );
}
