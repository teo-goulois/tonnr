import { refuseField } from "@repo/ui/hooks/form/form-context";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { typedUsername, usernameRefusal } from "@/components/account/username";
import {
  inSmallLetters,
  liveUsernameFault,
  UsernameInput,
  usernameSchema,
} from "@/components/account/username-form";
import { MorphText } from "@/components/shared/morph-text";
import { identifyAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { client } from "@/utils/orpc";

import { ProviderSignIn } from "./provider-sign-in";

export type AuthMode = "sign-in" | "sign-up";

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
  // What the link someone gave the visitor ends with. It goes with a sign-up: the new account
  // then has the link's owner as its sponsor, and the two are friends. Decision 041.
  invitation?: string | undefined;
  returnTo?: string | undefined;
};

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
export function AuthForm({ mode, onModeChange, onSuccess, invitation, returnTo }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const [providerPending, setProviderPending] = useState(false);

  const form = useAppForm({
    defaultValues: { username: "", email: "", password: "" },
    onSubmit: async ({ value, formApi }) => {
      if (providerPending) return;
      const username = typedUsername(value.username);
      const answer = isSignUp
        ? // The sign-in library asks every account for a name: a new one gives its username,
          // which is what it is called by.
          await authClient.signUp.email({
            email: value.email,
            password: value.password,
            username,
            name: username,
            ...(invitation !== undefined && { invitation }),
          })
        : await authClient.signIn.email({ email: value.email, password: value.password });
      if (answer.error) {
        // The API says in English why it refuses. A username it does not take is said under its
        // field, and a suspended account in the reader's language: the other reasons are the
        // sign-in library's, as it words them.
        const aboutUsername = isSignUp ? usernameRefusal(answer.error.code) : undefined;
        if (aboutUsername) {
          refuseField(formApi, "username", aboutUsername);
          return;
        }
        const reason =
          answer.error.code === "ACCOUNT_SUSPENDED" ? m.auth_suspended() : answer.error.message;
        toast.error(reason || m.auth_failed());
        return;
      }
      identifyAnalytics(answer.data?.user.id);
      if (isSignUp) void announceCheck(value.email);
      onSuccess();
    },
    validators: {
      onSubmit: z.object({
        username: isSignUp ? usernameSchema : z.string(),
        email: z.email(m.auth_email_invalid()),
        password: z.string().min(8, m.auth_password_too_short()),
      }),
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-m">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <ProviderSignIn
              invitation={invitation}
              returnTo={returnTo}
              disabled={isSubmitting}
              onPendingChange={setProviderPending}
            />
          )}
        </form.Subscribe>
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
              <form.AppField
                name="username"
                // A sign-in asks no username: what was typed before switching says nothing.
                validators={{
                  onChange: (field) => (isSignUp ? liveUsernameFault(field) : undefined),
                }}
                listeners={{ onChange: inSmallLetters }}
              >
                {(field) => <UsernameInput field={field} />}
              </form.AppField>
            </div>
          </div>
        </div>
        <form.AppField name="email">
          {(field) => <field.Input label={m.auth_email()} type="email" autoComplete="email" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.Input
              label={m.auth_password()}
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          )}
        </form.AppField>

        <form.SubmitButton disabled={providerPending}>
          <MorphText>{isSignUp ? m.auth_create_account() : m.auth_sign_in()}</MorphText>
        </form.SubmitButton>

        {/* A sign-up says what it accepts, and a sign-in offers a new password in the same place,
          so that the form keeps about the same height. */}
        {!isSignUp && (
          <p className="text-center text-s text-neutral-7">
            <Link
              to="/forgot-password"
              className="focus-ring rounded-xs underline underline-offset-2"
            >
              {m.auth_forgot_password()}
            </Link>
          </p>
        )}
        {isSignUp && (
          <p className="text-center text-s text-neutral-7">
            {m.auth_accept_terms()}{" "}
            <Link
              to="/terms"
              target="_blank"
              className="focus-ring rounded-xs underline underline-offset-2"
            >
              {m.terms_title()}
            </Link>
            {", "}
            <Link
              to="/privacy"
              target="_blank"
              className="focus-ring rounded-xs underline underline-offset-2"
            >
              {m.privacy_title()}
            </Link>
          </p>
        )}

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
      </form.Form>
    </form.AppForm>
  );
}
