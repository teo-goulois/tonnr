import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  type AccountDeletion,
  type DeletionRefusal,
  refusalOf,
} from "@/components/account/delete-account";
import { signInWith, useSignInProviders } from "@/components/auth/provider-sign-in";
import { resetAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { type Provider, PROVIDERS } from "@/lib/provider-auth";
import { leftPushHere } from "@/lib/push-here";
import { clearRecents } from "@/lib/recents";
import { leaveWith } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// Deleting the account, from the step of its panel that says what goes: decision 071.

type Asked = {
  // The account that is signed in, once the API has said: whether it has a password, and what
  // else it signs in with.
  account:
    | {
        username: string | null;
        email: string;
        hasPassword: boolean;
        signsInWith: readonly string[];
      }
    | undefined;
};

/**
 * What deletes the account. Once it is gone, the browser forgets the session and what it loaded
 * for it, as signing out does, and the map opens again for a visitor.
 */
export function useAccountDeletion({ account }: Asked): AccountDeletion {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const providers = useSignInProviders();
  const remove = useMutation(orpc.v1.account.delete.mutationOptions());
  const [refused, setRefused] = useState<DeletionRefusal>();
  const [signingIn, setSigningIn] = useState<Provider>();

  const deleteAccount = async (password: string | undefined) => {
    setRefused(undefined);
    try {
      await remove.mutateAsync(password === undefined ? {} : { password });
    } catch (error) {
      setRefused(refusalOf(error));
      return;
    }
    // The account and its sessions are gone: the browser lets go of its cookie, of its push
    // and of what it kept for the account.
    await authClient.signOut().catch(() => null);
    resetAnalytics();
    await leftPushHere();
    queryClient.clear();
    clearRecents();
    toast.success(m.delete_account_done());
    void navigate({ to: "/app", ignoreBlocker: true });
  };

  return {
    // The account the step deletes, by the name others read, or its address before it has one.
    account: account ? (account.username ? `@${account.username}` : account.email) : undefined,
    hasPassword: account?.hasPassword,
    // What the account signs in with that the instance still offers: an account signs in again
    // with its own, and another would sign in as another account.
    signsInAgainWith: PROVIDERS.filter(
      (provider) => account?.signsInWith.includes(provider) && providers.data?.[provider] === true,
    ),
    isDeleting: remove.isPending,
    signingIn,
    refused,
    // Whatever was written and not saved is asked about first: once the account goes, there is
    // no staying.
    onDelete: (password) => leaveWith(() => void deleteAccount(password)),
    onSignInAgain: (provider) => {
      setSigningIn(provider);
      void signInWith(provider)
        .then((left) => {
          if (!left) toast.error(m.auth_failed());
        })
        .catch(() => toast.error(m.auth_failed()))
        .finally(() => setSigningIn(undefined));
    },
  };
}
