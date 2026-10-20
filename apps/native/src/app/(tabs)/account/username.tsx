import { router } from "expo-router";

import { Step } from "@/components/account/settings-steps";
import { useOwnAccount } from "@/components/account/use-own-account";
import { UsernameForm } from "@/components/account/username-form";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { SkeletonText } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";

/**
 * The name others read of the account, chosen or changed on a step of its own (decision 041).
 * It is the account's own once the API says whose it is.
 */
export default function UsernameScreen() {
  const tell = useTell();
  const { account, isPending } = useOwnAccount();
  const current = account?.username ?? null;

  return (
    <Step title={current === null ? m.username_choose() : m.username_change()}>
      {current === null ? <Text tone="muted">{m.username_none()}</Text> : null}
      {isPending || !account ? (
        <SkeletonText lines={2} />
      ) : (
        <UsernameForm
          current={current}
          autoFocus
          onSaved={(username) => {
            tell({ title: m.username_saved({ username }), tone: "success" });
            if (router.canGoBack()) router.back();
          }}
        />
      )}
    </Step>
  );
}
