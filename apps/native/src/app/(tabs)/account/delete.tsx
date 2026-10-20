import { router } from "expo-router";

import { DeleteAccountStep } from "@/components/account/delete-account";
import { Step } from "@/components/account/settings-steps";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";

/**
 * Deletes the account, once it has read what goes and given its password or signed in again:
 * decision 071. A link to `?settings=delete` leads here, and someone signed out is asked to sign
 * in first, then comes back. It asks and does not send them: the account the step deleted is
 * signed out too, as the app leaves for the map.
 */
export default function DeleteScreen() {
  const { signedIn, pending } = useAccount();
  if (!pending && !signedIn) {
    return (
      <Step title={m.delete_account_title()}>
        <Text>{m.native_delete_sign_in()}</Text>
        <Button
          fill
          onPress={() =>
            router.push({
              pathname: "/sign-in",
              params: { reason: m.native_delete_sign_in(), next: "/account/delete" },
            })
          }
        >
          {m.auth_sign_in()}
        </Button>
      </Step>
    );
  }
  return <DeleteAccountStep />;
}
