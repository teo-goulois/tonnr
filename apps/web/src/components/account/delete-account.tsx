import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useId, useState } from "react";

import { ProviderButton } from "@/components/auth/provider-sign-in";
import type { Provider } from "@/lib/provider-auth";
import { m } from "@/paraglide/messages.js";

/** Why the API did not delete the account, as the step says it. */
export type DeletionRefusal = "password" | "session" | "many" | "operator" | "failed";

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
  onDelete: (password: string | undefined) => void;
  // Signs in again with that provider, and comes back to this step.
  onSignInAgain: (provider: Provider) => void;
};

/** Why the API did not delete the account, as its refusal says. */
export function refusalOf(error: unknown): DeletionRefusal {
  const refused = error as { code?: string; data?: { refused?: string } };
  if (refused.code === "FORBIDDEN") {
    return refused.data?.refused === "session" ? "session" : "password";
  }
  if (refused.code === "TOO_MANY_REQUESTS") return "many";
  if (refused.code === "CONFLICT") return "operator";
  return "failed";
}

const REFUSALS: Record<DeletionRefusal, () => string> = {
  password: m.delete_account_wrong_password,
  session: m.delete_account_stale,
  many: m.delete_account_many,
  operator: m.delete_account_operator,
  failed: m.delete_account_failed,
};

/**
 * One step into the account's panel: what goes with the account and what stays, the password
 * again or a fresh sign-in, and the button. Nothing brings an account back once it is deleted,
 * so the step says it before it asks. Decision 071.
 */
export function DeleteAccount({ deletion }: { deletion: AccountDeletion }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const { account, hasPassword, refused } = deletion;
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
        <form
          className="grid gap-s"
          onSubmit={(event) => {
            event.preventDefault();
            if (password && !deletion.isDeleting) deletion.onDelete(password);
          }}
        >
          <div className="grid gap-xxs">
            <Label htmlFor={id}>{m.delete_account_password()}</Label>
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              disabled={deletion.isDeleting}
              aria-invalid={refused === "password" || undefined}
              aria-describedby={refused ? `${id}-refused` : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {refused && (
            <p id={`${id}-refused`} role="alert" className="text-s text-error">
              {REFUSALS[refused]()}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="destructive"
              className="max-w-full"
              isPending={deletion.isDeleting}
              disabled={!password}
            >
              <span className="truncate">{confirm}</span>
            </Button>
          </div>
        </form>
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
              {REFUSALS[refused]()}
            </p>
          )}
          <Button
            variant="destructive"
            className="max-w-full"
            isPending={deletion.isDeleting}
            onClick={() => deletion.onDelete(undefined)}
          >
            <span className="truncate">{confirm}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
