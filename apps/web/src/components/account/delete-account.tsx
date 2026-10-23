import {
  type DeletionMessages,
  type DeletionRefusal,
  refusalOf,
  refusalWords,
} from "@repo/client/account/deletion";
import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { refuseField } from "@repo/ui/hooks/form/form-context";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { useEffect } from "react";
import { z } from "zod";

import { ProviderButton } from "@/components/auth/provider-sign-in";
import type { Provider } from "@/lib/provider-auth";
import { m } from "@/paraglide/messages.js";

// Why the API did not delete the account, read the same way by the app for phones.
export { type DeletionRefusal, refusalOf };

const REFUSALS: DeletionMessages = {
  delete_account_wrong_password: m.delete_account_wrong_password,
  delete_account_stale: m.delete_account_stale,
  delete_account_many: m.delete_account_many,
  delete_account_operator: m.delete_account_operator,
  delete_account_failed: m.delete_account_failed,
};

/** What deletes the account, and what it asks first: decision 071. The route gives it. */
export type AccountDeletion = {
  // The account that goes, as the step names it: `@` and its username, or its address before it
  // has one. Undefined while the API has not said.
  account: string | undefined;
  // Whether the account has a password, which it gives again. Undefined while the API has not
  // said.
  hasPassword: boolean | undefined;
  // What an account without a password signs in again with, among what it signs in with: the
  // API deletes it from a session opened in the last minutes alone, and says so when this one
  // is older. The API judges, by its own clock: the device's may be wrong.
  signsInAgainWith: Provider[];
  isDeleting: boolean;
  // The provider being signed in with again, while it is.
  signingIn: Provider | undefined;
  refused: DeletionRefusal | undefined;
  // Deletes the account with its password, or without for one that has none. It answers why the
  // API refused once it has answered, and nothing once the account is gone or the person stayed.
  onDelete: (password: string | undefined) => Promise<DeletionRefusal | undefined>;
  // Signs in again with that provider, and comes back to this step.
  onSignInAgain: (provider: Provider) => void;
};

/**
 * One step into the account's panel: what goes with the account and what stays, the password
 * again or a fresh sign-in, and the button. Nothing brings an account back once it is deleted,
 * so the step says it before it asks. Decision 071.
 */
export function DeleteAccount({ deletion }: { deletion: AccountDeletion }) {
  const { account, hasPassword, refused } = deletion;
  const form = useAppForm({
    defaultValues: { password: "" },
    validators: {
      onSubmit: z.object({
        password: z.string().min(1, m.delete_account_password_missing()),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      const refusal = await deletion.onDelete(value.password);
      if (refusal === "password") {
        refuseField(formApi, "password", m.delete_account_wrong_password());
      }
    },
  });
  // A wrong password the step is shown with is said under its field, as after a press.
  useEffect(() => {
    if (refused === "password") {
      refuseField(form, "password", m.delete_account_wrong_password());
    }
  }, [form, refused]);
  // An account without a password signs in again once the API says its session is too old.
  const signsInFirst = hasPassword === false && refused === "session";
  const offered = deletion.signsInAgainWith;
  // The button says which account goes: a sign-in again may have come back as another.
  const confirm = account?.startsWith("@")
    ? m.delete_account_confirm_named({ username: account.slice(1) })
    : m.delete_account_confirm();

  return (
    <div className="grid gap-l">
      <div className="grid gap-s">
        <p>{m.delete_account_intro()}</p>
        <section className="grid gap-xxs">
          <h2 className="text-s font-medium text-neutral-7">{m.delete_account_goes_title()}</h2>
          <p className="text-s text-pretty">{m.delete_account_goes()}</p>
        </section>
        <section className="grid gap-xxs">
          <h2 className="text-s font-medium text-neutral-7">{m.delete_account_stays_title()}</h2>
          <p className="text-s text-pretty">
            {m.delete_account_stays({ days: DELETED_USERNAME_DAYS })}
          </p>
        </section>
      </div>

      {account !== undefined && (
        <p className="text-s text-pretty">{m.delete_account_as({ account })}</p>
      )}

      {hasPassword === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : hasPassword ? (
        <form.AppForm>
          <form.Form className="grid gap-s">
            <form.AppField name="password">
              {(field) => (
                <field.Input
                  label={m.delete_account_password()}
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  disabled={deletion.isDeleting}
                />
              )}
            </form.AppField>
            {/* A wrong password is said under its field: another refusal is said here. */}
            {refused && refused !== "password" && (
              <p role="alert" className="text-s text-error">
                {refusalWords(refused, REFUSALS)}
              </p>
            )}
            <div>
              <form.SubmitButton
                variant="destructive"
                className="max-w-full"
                isPending={deletion.isDeleting}
              >
                <span className="truncate">{confirm}</span>
              </form.SubmitButton>
            </div>
          </form.Form>
        </form.AppForm>
      ) : signsInFirst ? (
        <div className="grid justify-items-start gap-s">
          <p role="alert" className="text-s text-pretty">
            {offered.length > 0 ? m.delete_account_sign_in_again() : m.delete_account_no_way()}
          </p>
          {offered.map((provider) => (
            <ProviderButton
              key={provider}
              provider={provider}
              isPending={deletion.signingIn === provider}
              disabled={deletion.signingIn !== undefined && deletion.signingIn !== provider}
              onClick={() => deletion.onSignInAgain(provider)}
            />
          ))}
        </div>
      ) : (
        <div className="grid justify-items-start gap-s">
          {refused && (
            <p role="alert" className="text-s text-error">
              {refusalWords(refused, REFUSALS)}
            </p>
          )}
          <Button
            variant="destructive"
            className="max-w-full"
            isPending={deletion.isDeleting}
            onClick={() => void deletion.onDelete(undefined)}
          >
            <span className="truncate">{confirm}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
