import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

/** Signs an account in. The admin creates none: an account is made in the app, or by the API. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const form = useForm({
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
    <form
      noValidate
      className="flex flex-col gap-m"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <Field label={m.auth_email()} errors={field.state.meta.errors}>
            {(invalid) => (
              <Input
                name={field.name}
                type="email"
                autoComplete="email"
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <Field label={m.auth_password()} errors={field.state.meta.errors}>
            {(invalid) => (
              <Input
                name={field.name}
                type="password"
                autoComplete="current-password"
                aria-invalid={invalid || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" isPending={isSubmitting}>
            {m.auth_sign_in()}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
