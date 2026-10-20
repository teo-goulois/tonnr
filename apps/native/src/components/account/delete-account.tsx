import { DELETED_USERNAME_DAYS } from "@repo/config/account";
import { TrashIcon } from "@repo/ui/icon";
import { useState } from "react";
import { View } from "react-native";

import { Field } from "@/components/auth/field";
import { PASSWORD_MAX } from "@/components/auth/sign-in-words";
import { ProviderButton } from "@/components/auth/provider-sign-in";
import { Button } from "@/components/ui/button";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { confirm } from "./confirm";
import { accountNamed, deleteLabel, refusalWords } from "./deletion";
import { Step } from "./settings-steps";
import { useAccountDeletion } from "./use-account-deletion";

/**
 * One step into the account's tab: what goes with the account and what stays, which account it
 * is, the password again or, for an account without one whose session the API finds too old, a
 * new sign-in with its own provider, and the button, which the system asks about once more.
 * Nothing brings an account back, so the step says it before it asks. Decision 071.
 */
export function DeleteAccountStep() {
  const { space } = useTheme();
  const deletion = useAccountDeletion();
  const [password, setPassword] = useState("");
  const { account, hasPassword, refused } = deletion;
  // An account without a password signs in again once the API says its session is too old.
  const signsInFirst = hasPassword === false && refused === "session";
  const label = deleteLabel(account);

  async function ask(given: string | undefined) {
    if (deletion.isDeleting) return;
    const sure = await confirm({
      title: m.native_delete_confirm_title(),
      message: m.delete_account_intro(),
      action: label,
    });
    if (sure) deletion.onDelete(given);
  }

  const refusal = refused ? (
    <Text tone="danger" size="s" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {refusalWords(refused)}
    </Text>
  ) : null;

  return (
    <Step title={m.delete_account_title()}>
      <Text>{m.delete_account_intro()}</Text>
      <View style={{ gap: space.s }}>
        <Card title={m.delete_account_goes_title()} description={m.delete_account_goes()} />
        <Card
          title={m.delete_account_stays_title()}
          description={m.delete_account_stays({ days: DELETED_USERNAME_DAYS })}
        />
      </View>

      {account ? (
        <Text size="s">{m.delete_account_as({ account: accountNamed(account) })}</Text>
      ) : null}

      {hasPassword === undefined ? (
        <Loading>
          <SkeletonText lines={3} />
        </Loading>
      ) : hasPassword ? (
        <View style={{ gap: space.s }}>
          <Field
            label={m.delete_account_password()}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (password) void ask(password);
            }}
            disabled={deletion.isDeleting}
            error={refused === "password" ? refusalWords(refused) : undefined}
          />
          {refused && refused !== "password" ? refusal : null}
          <Button
            variant="danger"
            icon={TrashIcon}
            fill
            loading={deletion.isDeleting}
            disabled={!password}
            onPress={() => void ask(password)}
          >
            {label}
          </Button>
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
          <Button
            variant="danger"
            icon={TrashIcon}
            fill
            loading={deletion.isDeleting}
            onPress={() => void ask(undefined)}
          >
            {label}
          </Button>
        </View>
      )}
    </Step>
  );
}
