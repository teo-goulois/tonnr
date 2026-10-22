import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { useState } from "react";
import { View } from "react-native";

import { Field } from "@/components/auth/field";
import { PASSWORD_MAX } from "@/components/auth/sign-in-words";
import { ProviderButton } from "@/components/auth/provider-sign-in";
import { Button } from "@/components/ui/button";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { accountNamed, deleteLabel, refusalWords } from "./deletion";
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
  const [password, setPassword] = useState("");
  // A password that was not given, said under its field once the button was pressed: the button
  // is never held still to stop a form that is not whole (decision 076).
  const [missing, setMissing] = useState(false);
  // Typed since the last press: a wrong password is no longer said under the field, as the web's
  // form drops a refusal once its field changes.
  const [retyped, setRetyped] = useState(false);
  const { account, hasPassword, refused } = deletion;
  // An account without a password signs in again once the API says its session is too old.
  const signsInFirst = hasPassword === false && refused === "session";
  const label = deleteLabel(account);

  const send = (given: string | undefined) => {
    if (deletion.isDeleting) return;
    if (given === "") {
      setMissing(true);
      return;
    }
    setRetyped(false);
    deletion.onDelete(given);
  };

  const refusal = refused ? (
    <Text tone="danger" size="s" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {refusalWords(refused)}
    </Text>
  ) : null;
  // The button at its own width, at the start, its name cut short rather than wrapped.
  const button = (given: string | undefined) => (
    <Button
      variant="danger"
      loading={deletion.isDeleting}
      onPress={() => send(given)}
      style={{ alignSelf: "flex-start", maxWidth: "100%" }}
    >
      {label}
    </Button>
  );

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
        <View style={{ gap: space.s }}>
          <Field
            label={m.delete_account_password()}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setMissing(false);
              setRetyped(true);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            returnKeyType="done"
            onSubmitEditing={() => send(password)}
            disabled={deletion.isDeleting}
            error={
              missing
                ? m.delete_account_password_missing()
                : refused === "password" && !retyped
                  ? refusalWords(refused)
                  : undefined
            }
          />
          {/* A wrong password is said under its field: another refusal is said here. */}
          {refused && refused !== "password" ? refusal : null}
          {button(password)}
        </View>
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
          {refusal}
          {button(undefined)}
        </View>
      )}
    </Step>
  );
}
