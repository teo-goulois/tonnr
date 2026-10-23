import { liveUsernameFault as liveFaultIn } from "@repo/client/username";
import { USERNAME_MAX } from "@repo/config/username";
import { Button } from "@repo/ui/components/ui/button";
import type { FormInput } from "@repo/ui/components/form/form-input";
import { refuseField } from "@repo/ui/hooks/form/form-context";
import { useAppForm } from "@repo/ui/hooks/form/form";
import type { AnyFieldApi, AnyFormApi } from "@tanstack/react-form";
import { useEffect } from "react";
import { z } from "zod";

import { m } from "@/paraglide/messages.js";

import { typedUsername, USERNAME_WORDS, usernameFault, useUsernameFree } from "./username";

/**
 * What a username field says as it is typed: what is wrong with the name once it is long enough
 * to be one. A name that is still being typed is not told that it is short; the form says so once
 * it is sent. Given as the field's `onChange` validator, and left out where no username is asked.
 */
export function liveUsernameFault({ value }: { value: string }) {
  return liveFaultIn(value, USERNAME_WORDS);
}

/** Keeps a username in small letters as it is typed, as it is kept. The field's listener. */
export function inSmallLetters({ value, fieldApi }: { value: string; fieldApi: AnyFieldApi }) {
  const small = value.toLowerCase();
  if (small !== value) fieldApi.setValue(small, { dontRunListeners: true });
}

/** What a form's schema says of a username: why it is no username, in the reader's language. */
export const usernameSchema = z.string().superRefine((typed, issues) => {
  const fault = usernameFault(typedUsername(typed));
  if (fault) issues.addIssue({ code: "custom", message: fault });
});

/**
 * The field a username is typed in. It says whether the name is free once typing has stopped,
 * and says it is taken under the field, as a refusal of the API would: an account is not made to
 * learn it by failing. `own` is the account's own username, which is not asked about.
 */
export function UsernameInput({
  field,
  own,
  disabled,
}: {
  // The field of a form's `AppField`, of which this reads its value, its form and its name.
  field: { state: { value: string }; form: AnyFormApi; name: string; Input: typeof FormInput };
  own?: string | null | undefined;
  disabled?: boolean;
}) {
  const isFree = useUsernameFree(typedUsername(field.state.value), own);
  const { form, name } = field;
  useEffect(() => {
    if (isFree === false) refuseField(form, name, m.username_taken());
  }, [form, name, isFree]);

  return (
    <field.Input
      label={m.auth_username()}
      description={isFree ? m.username_free() : m.username_hint()}
      autoComplete="username"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={USERNAME_MAX}
      disabled={disabled}
    />
  );
}

type UsernameFormProps = {
  // The account's username. Null for an account that has none yet.
  current: string | null;
  // Answers why the username was refused, or nothing once it is kept.
  onSave: (username: string) => Promise<string | undefined>;
  onSaved: (username: string) => void;
  // Left out where the form cannot be left, as on the way to a first contribution.
  onCancel?: () => void;
};

/**
 * Chooses the name others read of an account: its first, or another. It says whether the name
 * is free before it is sent, and why not once it was.
 */
export function UsernameForm({ current, onSave, onSaved, onCancel }: UsernameFormProps) {
  const form = useAppForm({
    defaultValues: { username: current ?? "" },
    validators: { onSubmit: z.object({ username: usernameSchema }) },
    onSubmit: async ({ value, formApi }) => {
      const username = typedUsername(value.username);
      if (username === current) return;
      const why = await onSave(username);
      if (why) refuseField(formApi, "username", why);
      else onSaved(username);
    },
  });
  return (
    <form.AppForm>
      <form.Form className="grid w-full gap-s">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSaving) => (
            <>
              <form.AppField
                name="username"
                validators={{ onChange: liveUsernameFault }}
                listeners={{ onChange: inSmallLetters }}
              >
                {(field) => <UsernameInput field={field} own={current} disabled={isSaving} />}
              </form.AppField>
              <div className="flex flex-wrap gap-xs">
                {/* The account's own name is not sent again: there is nothing to save. */}
                <form.Subscribe
                  selector={(state) => typedUsername(state.values.username) === current}
                >
                  {(isSame) => (
                    <form.SubmitButton size="sm" disabled={isSame}>
                      {m.username_save()}
                    </form.SubmitButton>
                  )}
                </form.Subscribe>
                {onCancel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={onCancel}
                  >
                    {m.action_cancel()}
                  </Button>
                )}
              </div>
            </>
          )}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
  );
}
