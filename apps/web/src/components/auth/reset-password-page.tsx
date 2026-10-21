import { buttonVariants } from "@repo/ui/components/ui/button";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { PageColumn } from "@/components/shared/page-column";
import { m } from "@/paraglide/messages.js";

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
  const form = useAppForm({
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
      <form.AppForm>
        <form.Form className="flex flex-col gap-m">
          <form.AppField name="password">
            {(field) => (
              <field.Input
                label={m.reset_new_password()}
                description={m.reset_signs_out()}
                type="password"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX}
              />
            )}
          </form.AppField>
          <form.SubmitButton>{m.reset_save()}</form.SubmitButton>
        </form.Form>
      </form.AppForm>
    </PageColumn>
  );
}
