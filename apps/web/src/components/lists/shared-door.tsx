import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { LockIcon } from "@repo/ui/icon";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";

import { ViewerSkeleton } from "@/components/viewer/viewer-skeleton";
import { m } from "@/paraglide/messages.js";

type SharedDoorProps = {
  // What stands between the reader and the list: nothing yet known, a password, a link that
  // opens no list, or an answer that could not be had.
  state: "opening" | "locked" | "missing" | "failed";
  // Why the password was not taken.
  refusal: "wrong" | "closed" | undefined;
  isChecking: boolean;
  onPassword: (password: string) => void;
  onRetry: () => void;
};

/** What a shared list's link shows before the list: its password, or that it opens none. */
export function SharedDoor({ state, refusal, isChecking, onPassword, onRetry }: SharedDoorProps) {
  const [password, setPassword] = useState("");
  const passwordId = useId();

  // The map is what comes, so its place is what waits.
  if (state === "opening") return <ViewerSkeleton />;

  return (
    <div className="grid min-h-0 place-items-center p-m">
      <div className="grid w-full max-w-sm gap-l">
        {state === "locked" ? (
          <form
            className="grid gap-m"
            onSubmit={(event) => {
              event.preventDefault();
              if (password && !isChecking) onPassword(password);
            }}
          >
            <div className="grid gap-xs">
              <h1 className="flex items-center gap-xs text-l font-medium">
                <LockIcon aria-hidden className="size-4.5" />
                {m.shared_locked_title()}
              </h1>
              <p className="text-neutral-7">{m.shared_locked_text()}</p>
            </div>
            <div className="grid gap-xs">
              <Label htmlFor={passwordId}>{m.shared_password()}</Label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                maxLength={72}
                autoComplete="off"
                autoFocus
                disabled={isChecking}
                aria-invalid={refusal !== undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              {refusal && (
                <p role="alert" className="text-s text-error">
                  {refusal === "wrong" ? m.shared_password_wrong() : m.shared_password_closed()}
                </p>
              )}
            </div>
            <Button type="submit" disabled={!password} isPending={isChecking}>
              {m.shared_open()}
            </Button>
          </form>
        ) : (
          <div className="grid justify-items-start gap-m">
            <div className="grid gap-xs">
              <h1 className="text-l font-medium">
                {state === "missing" ? m.shared_missing_title() : m.shared_failed_title()}
              </h1>
              <p className="text-neutral-7">
                {state === "missing" ? m.shared_missing_text() : m.shared_failed_text()}
              </p>
            </div>
            {state === "failed" ? (
              <Button variant="secondary" onClick={onRetry}>
                {m.action_retry()}
              </Button>
            ) : (
              <Link to="/" className="focus-ring rounded-xs underline underline-offset-2">
                {m.shared_home()}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
