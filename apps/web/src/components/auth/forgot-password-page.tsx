import { buttonVariants } from "@repo/ui/components/ui/button";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { PageColumn } from "@/components/shared/page-column";
import { m } from "@/paraglide/messages.js";

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
  const form = useAppForm({
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
      <form.AppForm>
        <form.Form className="flex flex-col gap-m">
          <form.AppField name="email">
            {(field) => <field.Input label={m.auth_email()} type="email" autoComplete="email" />}
          </form.AppField>
          <form.SubmitButton>{m.reset_ask_send()}</form.SubmitButton>
          <p className="text-center text-s text-neutral-7">
            <Link to="/login" className="focus-ring rounded-xs underline underline-offset-2">
              {m.reset_back_to_sign_in()}
            </Link>
          </p>
        </form.Form>
      </form.AppForm>
    </PageColumn>
  );
}
