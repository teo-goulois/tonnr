import { router } from "expo-router";
import { View } from "react-native";

import { Step } from "@/components/account/settings-steps";
import { useOwnAccount } from "@/components/account/use-own-account";
import { UsernameForm } from "@/components/account/username-form";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { ErrorState } from "@/components/ui/error-state";
import { Loading, SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * The name others read of the account, on a step of its own, where a link and the friends' step
 * lead (decision 041): the form the account's tab unfolds in place, in the web's words. Its title
 * and what it asks wait for the API, which knows the username in force, and the stack's back
 * stands for the form's Cancel. A visitor is asked for an account, and comes back here.
 */
export default function UsernameScreen() {
  const { space } = useTheme();
  const tell = useTell();
  const { signedIn, account, isPending, isError, refetch, isRefetching } = useOwnAccount();

  if (signedIn === false) {
    return (
      <Step title={m.auth_username()}>
        <AccountPrompt text={m.account_sign_in_prompt()} next="/account/username" />
      </Step>
    );
  }

  if (!account) {
    return (
      <Step title={m.auth_username()}>
        {isError && !isPending ? (
          <ErrorState
            plain
            title={m.native_account_load_failed()}
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
        ) : (
          <Loading>
            <SkeletonText lines={3} />
          </Loading>
        )}
      </Step>
    );
  }

  const current = account.username;
  return (
    <Step title={current === null ? m.username_choose() : m.username_change()}>
      <View style={{ gap: space.s }}>
        {current === null ? <Text size="s">{m.username_none()}</Text> : null}
        <UsernameForm
          current={current}
          autoFocus
          onSaved={(username) => {
            tell({ title: m.username_saved({ username }), tone: "success" });
            if (router.canGoBack()) router.back();
          }}
        />
      </View>
    </Step>
  );
}
