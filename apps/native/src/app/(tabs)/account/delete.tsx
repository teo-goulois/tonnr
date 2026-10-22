import { DeleteAccountStep } from "@/components/account/delete-account";
import { Step } from "@/components/account/settings-steps";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";

/**
 * Deletes the account, once it has read what goes and given its password or signed in again:
 * decision 071. A link to `?settings=delete` leads here, and someone signed out is asked for an
 * account as the account's tab asks it, then comes back here. It asks and does not send them:
 * the account the step deleted is signed out too, as the app leaves for the map.
 */
export default function DeleteScreen() {
  const { signedIn, pending } = useAccount();
  if (!pending && !signedIn) {
    return (
      <Step title={m.delete_account_title()}>
        <AccountPrompt text={m.account_sign_in_prompt()} next="/account/delete" />
      </Step>
    );
  }
  return <DeleteAccountStep />;
}
