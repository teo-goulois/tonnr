import { USERNAME_MAX, USERNAME_MIN } from "@repo/config/username";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { cn } from "@repo/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  typedUsername,
  usernameFault,
  usernameRefusal,
  useUsernameFree,
} from "@/components/account/username";
import { MorphText } from "@/components/shared/morph-text";
import { identifyAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { client } from "@/utils/orpc";

export type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
  // What the link someone gave the visitor ends with. It goes with a sign-up: the new account
  // then has the link's owner as its sponsor, and the two are friends. Decision 041.
  invitation?: string | undefined;
};

function Field({
  label,
  errors,
  hint,
  children,
}: {
  label: string;
  errors: ({ message?: string } | undefined)[];
  // What the field says of itself while nothing is wrong with it.
  hint?: string;
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
      {hint && messages.length === 0 && (
        <span className="text-s font-normal text-neutral-7">{hint}</span>
      )}
    </Label>
  );
}

/**
 * The name others will read of the account. It is kept in small letters, and the API says
 * whether it is free once typing has stopped: an account is not made to learn it by failing.
 */
function UsernameField({
  value,
  errors,
  onBlur,
  onChange,
}: {
  value: string;
  errors: ({ message?: string } | undefined)[];
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const isFree = useUsernameFree(value);
  // A name that is still being typed is not told that it is short. What else is wrong with it
  // is said as it is typed, and not at the moment the form is sent.
  const fault = value.length >= USERNAME_MIN ? usernameFault(value) : undefined;
  const wrong = isFree === false ? m.username_taken() : fault;
  return (
    <Field
      label={m.auth_username()}
      errors={wrong ? [{ message: wrong }] : errors}
      hint={isFree ? m.username_free() : m.username_hint()}
    >
      {(invalid) => (
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          aria-invalid={invalid || undefined}
          value={value}
          onBlur={onBlur}
          onChange={(event) => onChange(typedUsername(event.target.value))}
        />
      )}
    </Field>
  );
}

/**
 * Tells a new account to look for the mail that checks its address, on an instance that sends
 * one. A sign-up does not say whether its mail left, so the words do not either: they say where
 * to ask for another. The account is signed in either way, so a failure to ask says nothing.
 */
async function announceCheck(email: string) {
  const account = await client.v1.account.get().catch(() => null);
  if (account?.checksAddresses && !account.emailVerified) toast(m.verify_expect({ email }));
}

/** Signs a visitor in, or creates their account. One form does both, and a link switches. */
export function AuthForm({ mode, onModeChange, onSuccess, invitation }: AuthFormProps) {
  const isSignUp = mode === "sign-up";

  const form = useForm({
    defaultValues: { username: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      const answer = isSignUp
        ? // The sign-in library asks every account for a name: a new one gives its username,
          // which is what it is called by.
          await authClient.signUp.email({
            ...value,
            name: value.username,
            ...(invitation !== undefined && { invitation }),
          })
        : await authClient.signIn.email({ email: value.email, password: value.password });
      if (answer.error) {
        // The API says in English why it refuses. A suspended account and a username it does
        // not take are told in the reader's language: the other reasons are the sign-in
        // library's, as it words them.
        const reason =
          answer.error.code === "ACCOUNT_SUSPENDED"
            ? m.auth_suspended()
            : (usernameRefusal(answer.error.code) ?? answer.error.message);
        toast.error(reason || m.auth_failed());
        return;
      }
      identifyAnalytics(answer.data?.user.id);
      if (isSignUp) void announceCheck(value.email);
      onSuccess();
    },
    validators: {
      onSubmit: z.object({
        username: isSignUp
          ? z.string().superRefine((username, issues) => {
              const fault = usernameFault(username);
              if (fault) issues.addIssue({ code: "custom", message: fault });
            })
          : z.string(),
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
      {/* The username stays in the page and its row collapses, so the form changes height smoothly.
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
            <form.Field name="username">
              {(field) => (
                <UsernameField
                  value={field.state.value}
                  errors={field.state.meta.errors}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
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
            <MorphText>{isSignUp ? m.auth_create_account() : m.auth_sign_in()}</MorphText>
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
