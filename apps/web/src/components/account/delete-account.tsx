import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { GoogleIcon } from "@repo/ui/icon";
import { useId, useState } from "react";

import { m } from "@/paraglide/messages.js";

/** Why the API did not delete the account, as the step says it. */
export type DeletionRefusal = "password" | "session" | "many" | "operator" | "failed";

/** What deletes the account, and what it asks first: decision 071. The route gives it. */
export type AccountDeletion = {
  // Whether the account has a password, which it gives again. Undefined while the API has not
  // said.
  hasPassword: boolean | undefined;
  // Whether this browser's session was opened in the last minutes: an account without a
  // password is deleted from such a session alone, and signs in again first.
  isFresh: boolean;
  // Whether the instance signs in with Google, which such an account signs in again with.
  offersGoogle: boolean;
  isDeleting: boolean;
  isSigningIn: boolean;
  refused: DeletionRefusal | undefined;
  onDelete: (password: string | undefined) => void;
  // Signs in again with Google, and comes back to this step.
  onSignInAgain: () => void;
};

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
  const { hasPassword, isFresh, refused } = deletion;
  // An account without a password signs in again once its session is old, or the API said so.
  const signsInFirst = hasPassword === false && (!isFresh || refused === "session");

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
              isPending={deletion.isDeleting}
              disabled={!password}
            >
              {m.delete_account_confirm()}
            </Button>
          </div>
        </form>
      ) : signsInFirst ? (
        <div className="grid justify-items-start gap-s">
          <p className="text-s">
            {deletion.offersGoogle ? m.delete_account_sign_in_again() : m.delete_account_no_way()}
          </p>
          {deletion.offersGoogle && (
            <Button
              variant="outline"
              isPending={deletion.isSigningIn}
              onClick={deletion.onSignInAgain}
            >
              <GoogleIcon data-slot="icon" aria-hidden />
              {m.auth_google()}
            </Button>
          )}
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
            isPending={deletion.isDeleting}
            onClick={() => deletion.onDelete(undefined)}
          >
            {m.delete_account_confirm()}
          </Button>
        </div>
      )}
    </div>
  );
}
