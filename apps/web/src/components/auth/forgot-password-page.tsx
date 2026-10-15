import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

import { Field } from "./auth-form";
import { PageColumn } from "@/components/shared/page-column";

/**
 * Where the page stands: it is `asking` for an address, the API answered for the one it was
 * given, which it does the same whether the address has an account or not, or the instance sends
 * no mail and is `off`.
 */
export type ForgotPasswordState =
  | { step: "asking" }
  | { step: "sent"; email: string }
  | { step: "off" };

type ForgotPasswordPageProps = {
  state: ForgotPasswordState;
  // Asks for the link. It resolves once the API answered, whatever it answered.
  onAsk: (email: string) => Promise<void>;
};

/**
 * Where an account that forgot its password asks for a link to choose another. The page cannot
 * say whether the address has an account: the API does not tell it. Decision 026.
 */
export function ForgotPasswordPage({ state, onAsk }: ForgotPasswordPageProps) {
  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) => onAsk(value.email.trim()),
    validators: { onSubmit: z.object({ email: z.email(m.auth_email_invalid()) }) },
  });

  if (state.step !== "asking") {
    return (
      <PageColumn>
        <div className="grid gap-xs" aria-live="polite">
          <h1 className="text-l font-medium">
            {state.step === "sent" ? m.reset_ask_sent_title() : m.reset_ask_title()}
          </h1>
          <p className="text-pretty text-neutral-7">
            {state.step === "sent" ? m.reset_ask_sent({ email: state.email }) : m.reset_ask_off()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-s">
          <Link to="/login" className={buttonVariants({ variant: "secondary" })}>
            {m.reset_back_to_sign_in()}
          </Link>
        </div>
      </PageColumn>
    );
  }

  return (
    <PageColumn>
      <div className="grid gap-xs">
        <h1 className="text-l font-medium">{m.reset_ask_title()}</h1>
        <p className="text-pretty text-neutral-7">{m.reset_ask_text()}</p>
      </div>
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
        <form.Subscribe selector={(formState) => formState.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isPending={isSubmitting}>
              {m.reset_ask_send()}
            </Button>
          )}
        </form.Subscribe>
        <p className="text-center text-s text-neutral-7">
          <Link to="/login" className="focus-ring rounded-xs underline underline-offset-2">
            {m.reset_back_to_sign_in()}
          </Link>
        </p>
      </form>
    </PageColumn>
  );
}
