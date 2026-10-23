import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { View } from "react-native";
import { z } from "zod";

import { PASSWORD_MAX } from "@/components/auth/sign-in-words";
import { ProviderButton } from "@/components/auth/provider-sign-in";
import { Button } from "@/components/ui/button";
import { refuseField, useAppForm, useFormSend } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { accountNamed, type DeletionRefusal, deleteLabel, refusalWords } from "./deletion";
import { Step } from "./settings-steps";
import { useAccountDeletion } from "./use-account-deletion";

/** What goes with the account, or what stays: a title over its words, as the web's sections. */
function Said({ title, children }: { title: string; children: string }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <Text size="s">{children}</Text>
    </View>
  );
}

/** A refusal that is not about the password, said where the web says it: over the button. */
function Refusal({ refused }: { refused: DeletionRefusal }) {
  return (
    <Text tone="danger" size="s" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {refusalWords(refused)}
    </Text>
  );
}

// The button at its own width, at the start, its name cut short rather than wrapped.
const AT_ITS_WIDTH = { alignSelf: "flex-start", maxWidth: "100%" } as const;

type Deletion = ReturnType<typeof useAccountDeletion>;

function usePasswordForm(deletion: Deletion) {
  return useAppForm({
    defaultValues: { password: "" },
    validators: {
      onSubmit: z.object({
        password: z.string().min(1, m.delete_account_password_missing()),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      const refusal = await deletion.onDelete(value.password);
      // A wrong password is said under its field, which the form gives the focus and the phone
      // buzzes for; another refusal is said over the button, and buzzed for here.
      if (refusal === "password") refuseField(formApi, "password", refusalWords(refusal));
      else if (refusal) feel("failed");
    },
  });
}

/**
 * The password given again and the button that deletes, as the web's form: a password left out
 * is said under its field once the button is pressed, which is never held still for it, and so
 * is a wrong one, until the field changes (decision 076). The field waits while the account is
 * deleted, as the web's.
 */
function PasswordFields({
  form,
  deletion,
}: {
  form: ReturnType<typeof usePasswordForm>;
  deletion: Deletion;
}) {
  const { space } = useTheme();
  const send = useFormSend();
  const { refused } = deletion;
  return (
    <View style={{ gap: space.s }}>
      <form.AppField name="password">
        {(field) => (
          <field.Input
            label={m.delete_account_password()}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            returnKeyType="done"
            // The keyboard stays while a password left out is said under the field.
            submitBehavior="submit"
            onSubmitEditing={() => void send()}
            editable={!deletion.isDeleting}
          />
        )}
      </form.AppField>
      {/* A wrong password is said under its field: another refusal is said here. */}
      {refused && refused !== "password" ? <Refusal refused={refused} /> : null}
      <form.SubmitButton variant="danger" pending={deletion.isDeleting} style={AT_ITS_WIDTH}>
        {deleteLabel(deletion.account)}
      </form.SubmitButton>
    </View>
  );
}

function PasswordForm({ deletion }: { deletion: Deletion }) {
  const form = usePasswordForm(deletion);
  return (
    <form.AppForm>
      <PasswordFields form={form} deletion={deletion} />
    </form.AppForm>
  );
}

/**
 * One step into the account's tab: what goes with the account and what stays, which account it
 * is, the password again or, for an account without one whose session the API finds too old, a
 * new sign-in with its own provider, and the button, as the web's `DeleteAccount` draws them.
 * Nothing brings an account back, so the step says it before the button, which deletes at its
 * press, as the web's does: its name says which account goes. Decision 071.
 */
export function DeleteAccountStep() {
  const { space } = useTheme();
  const deletion = useAccountDeletion();
  const { account, hasPassword, refused } = deletion;
  // An account without a password signs in again once the API says its session is too old.
  const signsInFirst = hasPassword === false && refused === "session";

  return (
    <Step title={m.delete_account_title()}>
      <View style={{ gap: space.s }}>
        <Text>{m.delete_account_intro()}</Text>
        <Said title={m.delete_account_goes_title()}>{m.delete_account_goes()}</Said>
        <Said title={m.delete_account_stays_title()}>
          {m.delete_account_stays({ days: DELETED_USERNAME_DAYS })}
        </Said>
      </View>

      {account ? (
        <Text size="s">{m.delete_account_as({ account: accountNamed(account) })}</Text>
      ) : null}

      {hasPassword === undefined ? (
        <Loading>
          <Skeleton height={80} />
        </Loading>
      ) : hasPassword ? (
        <PasswordForm deletion={deletion} />
      ) : signsInFirst ? (
        <View style={{ gap: space.s }}>
          <Text size="s" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {deletion.signsInAgainWith.length > 0
              ? m.delete_account_sign_in_again()
              : m.delete_account_no_way()}
          </Text>
          {deletion.signsInAgainWith.map((provider) => (
            <ProviderButton
              key={provider}
              provider={provider}
              pending={deletion.signingIn === provider}
              disabled={deletion.signingIn !== undefined && deletion.signingIn !== provider}
              onPress={() => deletion.onSignInAgain(provider)}
            />
          ))}
        </View>
      ) : (
        <View style={{ gap: space.s }}>
          {refused ? <Refusal refused={refused} /> : null}
          <Button
            variant="danger"
            loading={deletion.isDeleting}
            onPress={() => {
              if (deletion.isDeleting) return;
              void deletion.onDelete(undefined).then((refusal) => {
                if (refusal) feel("failed");
              });
            }}
            style={AT_ITS_WIDTH}
          >
            {deleteLabel(account)}
          </Button>
        </View>
      )}
    </Step>
  );
}
