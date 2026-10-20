import { Redirect } from "expo-router";

import { DeleteAccountStep } from "@/components/account/delete-account";
import { useAccount } from "@/lib/account";
import { m } from "@/paraglide/messages";

/**
 * Deletes the account, once it has read what goes and given its password or signed in again:
 * decision 071. A link to `?settings=delete` leads here, and someone signed out signs in first,
 * then comes back.
 */
export default function DeleteScreen() {
  const { signedIn, pending } = useAccount();
  if (!pending && !signedIn) {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: { reason: m.native_delete_sign_in(), next: "/account/delete" },
        }}
      />
    );
  }
  return <DeleteAccountStep />;
}
