"use client";

// From the teogoulois registry (`form`): the button that sends a form, pending while it is sent.
// Decision 076.

import { Button, type ButtonProps } from "@repo/ui/components/ui/button";

import { useFormContext } from "../../hooks/form/form-context";

export type SubmitButtonProps = Omit<ButtonProps, "isPending" | "type"> & {
  // Pending for what the form waits on beyond its own submit, such as a mutation of the route.
  isPending?: boolean;
};

export function SubmitButton({ isPending = false, ...props }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => <Button {...props} type="submit" isPending={isSubmitting || isPending} />}
    </form.Subscribe>
  );
}
