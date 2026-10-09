import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { cn } from "@repo/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { TextMorph } from "torph/react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";

export type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
};

function Field({
  label,
  errors,
  children,
}: {
  label: string;
  errors: ({ message?: string } | undefined)[];
  children: (invalid: boolean) => React.ReactNode;
}) {
  const messages = errors.flatMap((error) => (error?.message ? [error.message] : []));
  return (
    <Label className="grid gap-xxs">
      {label}
      {children(messages.length > 0)}
      {messages.map((message) => (
        <span key={message} role="alert" className="text-s font-normal text-error">
          {message}
        </span>
      ))}
    </Label>
  );
}

/** Signs a visitor in, or creates their account. One form does both, and a link switches. */
export function AuthForm({ mode, onModeChange, onSuccess }: AuthFormProps) {
  const isSignUp = mode === "sign-up";

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      const answer = isSignUp
        ? await authClient.signUp.email(value)
        : await authClient.signIn.email({ email: value.email, password: value.password });
      if (answer.error) {
        // The API says in English why it refuses. A suspended account is told in its own
        // language: the other reasons are the sign-in library's, as it words them.
        const reason =
          answer.error.code === "ACCOUNT_SUSPENDED" ? m.auth_suspended() : answer.error.message;
        toast.error(reason || m.auth_failed());
        return;
      }
      onSuccess();
    },
    validators: {
      onSubmit: z.object({
        name: isSignUp ? z.string().trim().min(2, m.auth_name_too_short()) : z.string(),
        email: z.email(m.auth_email_invalid()),
        password: z.string().min(8, m.auth_password_too_short()),
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
      {/* The name stays in the page and its row collapses, so the form changes height smoothly.
          The padding leaves room for the focus ring, and the margins cancel it: they add up to
          minus the gap, so a collapsed row takes no room at all. */}
      <div
        inert={!isSignUp}
        className={cn(
          "-mx-xs -mt-xs mb-[calc(var(--spacing-xs)-var(--spacing-m))] grid transition-[grid-template-rows,opacity] duration-250 ease-theme motion-reduce:transition-none",
          isSignUp ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-xs pt-xs pb-[calc(var(--spacing-m)-var(--spacing-xs))]">
            <form.Field name="name">
              {(field) => (
                <Field label={m.auth_name()} errors={field.state.meta.errors}>
                  {(invalid) => (
                    <Input
                      name={field.name}
                      autoComplete="name"
                      aria-invalid={invalid || undefined}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  )}
                </Field>
              )}
            </form.Field>
          </div>
        </div>
      </div>
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
                autoComplete={isSignUp ? "new-password" : "current-password"}
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
            <TextMorph>{isSignUp ? m.auth_create_account() : m.auth_sign_in()}</TextMorph>
          </Button>
        )}
      </form.Subscribe>

      <p className="text-center text-s text-neutral-7">
        {isSignUp ? m.auth_have_account() : m.auth_no_account()}{" "}
        <button
          type="button"
          className="focus-ring cursor-pointer rounded-(--radius-xs) font-medium text-neutral-10 underline underline-offset-4"
          onClick={() => onModeChange(isSignUp ? "sign-in" : "sign-up")}
        >
          {isSignUp ? m.auth_sign_in() : m.auth_create_account()}
        </button>
      </p>
    </form>
  );
}
