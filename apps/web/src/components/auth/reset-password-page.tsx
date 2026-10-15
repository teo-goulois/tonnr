import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

import { Field } from "./auth-form";
import { PageColumn } from "@/components/shared/page-column";

// The lengths the sign-in library takes a password of, as a sign-up checks them.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

type ResetPasswordPageProps = {
  // False when the link carries no token, or the API said that it works no more: once used, or
  // after its hour.
  isValid: boolean;
  // Sets the new password. It resolves once the API answered, whatever it answered.
  onReset: (password: string) => Promise<void>;
};

/**
 * Where the link of the mail for a new password lands: the account chooses one, and is signed out
 * everywhere. The link signs no one in. Decision 026.
 */
export function ResetPasswordPage({ isValid, onReset }: ResetPasswordPageProps) {
  const form = useForm({
    defaultValues: { password: "" },
    onSubmit: ({ value }) => onReset(value.password),
    validators: {
      onSubmit: z.object({
        password: z.string().min(PASSWORD_MIN, m.auth_password_too_short()).max(PASSWORD_MAX),
      }),
    },
  });

  if (!isValid) {
    return (
      <PageColumn>
        <div className="grid gap-xs" aria-live="polite">
          <h1 className="text-l font-medium">{m.reset_title_invalid()}</h1>
          <p className="text-pretty text-neutral-7">{m.reset_invalid()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-s">
          <Link to="/forgot-password" className={buttonVariants()}>
            {m.reset_ask_again()}
          </Link>
        </div>
      </PageColumn>
    );
  }

  return (
    <PageColumn>
      <h1 className="text-l font-medium">{m.reset_title()}</h1>
      <form
        noValidate
        className="flex flex-col gap-m"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Field name="password">
          {(field) => (
            <Field
              label={m.reset_new_password()}
              errors={field.state.meta.errors}
              hint={m.reset_signs_out()}
            >
              {(invalid) => (
                <Input
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX}
                  aria-invalid={invalid || undefined}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </Field>
          )}
        </form.Field>
        <form.Subscribe selector={(formState) => formState.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isPending={isSubmitting}>
              {m.reset_save()}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </PageColumn>
  );
}
