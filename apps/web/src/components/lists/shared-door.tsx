import { Button } from "@repo/ui/components/ui/button";
import { useAppForm } from "@repo/ui/hooks/form/form";
import { refuseField } from "@repo/ui/hooks/form/form-context";
import { LockIcon } from "@repo/ui/icon";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { z } from "zod";

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
  const passwordId = useId();
  // How many times a password was given: the API's answer to each is said under the field, even
  // when it is the same as the last.
  const [tries, setTries] = useState(0);
  const form = useAppForm({
    defaultValues: { password: "" },
    validators: {
      onSubmit: z.object({ password: z.string().min(1, m.shared_password_missing()) }),
    },
    onSubmit: ({ value }) => {
      if (isChecking) return;
      setTries((count) => count + 1);
      onPassword(value.password);
    },
  });
  // The field was set aside while the password was checked: it takes the keyboard back with what
  // the API said of it.
  useEffect(() => {
    if (tries === 0 || isChecking || !refusal) return;
    refuseField(
      form,
      "password",
      refusal === "wrong" ? m.shared_password_wrong() : m.shared_password_closed(),
    );
    document.getElementById(passwordId)?.focus();
  }, [form, passwordId, tries, isChecking, refusal]);

  // The map is what comes, so its place is what waits.
  if (state === "opening") return <ViewerSkeleton />;

  return (
    <div className="grid min-h-0 place-items-center p-m">
      <div className="grid w-full max-w-sm gap-l">
        {state === "locked" ? (
          <form.AppForm>
            <form.Form className="grid gap-m">
              <div className="grid gap-xs">
                <h1 className="flex items-center gap-xs text-l font-medium">
                  <LockIcon aria-hidden className="size-4.5" />
                  {m.shared_locked_title()}
                </h1>
                <p className="text-neutral-7">{m.shared_locked_text()}</p>
              </div>
              <form.AppField name="password">
                {(field) => (
                  <field.Input
                    id={passwordId}
                    label={m.shared_password()}
                    type="password"
                    maxLength={72}
                    autoComplete="off"
                    autoFocus
                    disabled={isChecking}
                  />
                )}
              </form.AppField>
              <form.SubmitButton isPending={isChecking}>{m.shared_open()}</form.SubmitButton>
            </form.Form>
          </form.AppForm>
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
