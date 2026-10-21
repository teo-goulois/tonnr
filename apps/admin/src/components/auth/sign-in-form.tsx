import { useAppForm } from "@repo/ui/hooks/form/form";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

/** Signs an account in. The admin creates none: an account is made in the app, or by the API. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      const answer = await authClient.signIn.email(value);
      if (answer.error) {
        // An account that an operator suspended is told so in the reader's language.
        const suspended = answer.error.code === "ACCOUNT_SUSPENDED";
        toast.error(suspended ? m.auth_suspended() : answer.error.message || m.auth_failed());
        return;
      }
      onSuccess();
    },
    validators: {
      onSubmit: z.object({
        email: z.email(m.auth_email_invalid()),
        password: z.string().min(1, m.auth_password_missing()),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-m">
        <form.AppField name="email">
          {(field) => <field.Input label={m.auth_email()} type="email" autoComplete="email" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.Input
              label={m.auth_password()}
              type="password"
              autoComplete="current-password"
            />
          )}
        </form.AppField>

        <form.SubmitButton>{m.auth_sign_in()}</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
