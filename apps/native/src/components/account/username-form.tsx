import { USERNAME_MAX } from "@repo/config/username";
import type { AnyFieldApi, AnyFormApi } from "@tanstack/react-form";
import { type ReactNode, useEffect } from "react";
import { type TextInputProps, View } from "react-native";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { refuseField, useAppForm, useFormSend, useSelector } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { liveUsernameFault, typedUsername, usernameFault } from "./username";
import { useSaveUsername, useUsernameFree } from "./use-username";

export { liveUsernameFault };

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

/** The field of a form's `AppField`: its value, its form, its name and the kit's input. */
type UsernameField = {
  state: { value: string };
  form: AnyFormApi;
  name: string;
  Input: (
    props: Omit<TextInputProps, "value" | "onChangeText"> & {
      label?: string;
      description?: string;
    },
  ) => ReactNode;
};

/**
 * The field a username is typed in, as the web's `UsernameInput`: it says whether the name is
 * free once typing has stopped, and says it is taken under the field, as a refusal of the API
 * would, so that an account does not learn it by failing. Given in a form's `AppField` with
 * `liveUsernameFault` as its `onChange` validator and `inSmallLetters` as its listener. `own` is
 * the account's own username, which is not asked about. It never takes the keyboard at once, as
 * the web's never does: what is said over it is read first.
 */
export function UsernameInput({
  field,
  own,
  disabled = false,
  onSubmitEditing,
}: {
  field: UsernameField;
  own?: string | null | undefined;
  disabled?: boolean;
  /** What the keyboard's own key does: the form's send. */
  onSubmitEditing?: () => void;
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
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType="nickname"
      autoComplete="off"
      maxLength={USERNAME_MAX}
      returnKeyType="done"
      // The keyboard stays while what is wrong with the name is said under the field.
      submitBehavior="submit"
      onSubmitEditing={onSubmitEditing}
      editable={!disabled}
    />
  );
}

function useUsernameForm(current: string | null, onSaved: (username: string) => void) {
  const save = useSaveUsername();
  return useAppForm({
    defaultValues: { username: current ?? "" },
    validators: { onSubmit: z.object({ username: usernameSchema }) },
    onSubmit: async ({ value, formApi }) => {
      const username = typedUsername(value.username);
      if (username === current) return;
      const why = await save(username);
      // What the API refused is said under the field, which the form gives the focus.
      if (why) {
        refuseField(formApi, "username", why);
        return;
      }
      feel("done");
      onSaved(username);
    },
  });
}

function UsernameFields({
  form,
  current,
  onCancel,
}: {
  form: ReturnType<typeof useUsernameForm>;
  current: string | null;
  onCancel: (() => void) | undefined;
}) {
  const { space } = useTheme();
  const send = useFormSend();
  const isSaving = useSelector(form.store, (state) => state.isSubmitting);
  // The account's own name is not sent again: there is nothing to save.
  const isSame = useSelector(
    form.store,
    (state) => typedUsername(state.values.username) === current,
  );
  return (
    <View style={{ gap: space.s }}>
      <form.AppField
        name="username"
        validators={{ onChange: liveUsernameFault }}
        listeners={{ onChange: inSmallLetters }}
      >
        {(field) => (
          <UsernameInput
            field={field}
            own={current}
            disabled={isSaving}
            onSubmitEditing={() => void send()}
          />
        )}
      </form.AppField>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <form.SubmitButton disabled={isSame}>{m.username_save()}</form.SubmitButton>
        {onCancel ? (
          <Button variant="ghost" disabled={isSaving} onPress={onCancel}>
            {m.action_cancel()}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Chooses the name others read of an account, its first or another, as the web's `UsernameForm`
 * does: it says whether the name is free before it is sent, what is wrong with it once it is long
 * enough to be judged, and why not once it was sent, under the field, which then takes the
 * keyboard. Its Save stands at its own width and waits only for a name other than the account's
 * own (decision 076). Decision 041.
 */
export function UsernameForm({
  current,
  onSaved,
  onCancel,
}: {
  // The account's username. Null for an account that has none yet.
  current: string | null;
  onSaved: (username: string) => void;
  // Left out where the form cannot be left, as on the way to a first contribution, or where the
  // stack's own back leaves it.
  onCancel?: () => void;
  /**
   * @deprecated The field never takes the keyboard at once, as the web's never does: what is
   * said over it is read first. Left for a screen that still gives it, which changes nothing.
   */
  autoFocus?: boolean;
}) {
  const form = useUsernameForm(current, onSaved);
  return (
    <form.AppForm>
      <UsernameFields form={form} current={current} onCancel={onCancel} />
    </form.AppForm>
  );
}
