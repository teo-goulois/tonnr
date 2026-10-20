import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";

import { type Provider, signInWith, useOfferedProviders } from "@/components/auth/provider-sign-in";
import { feel } from "@/components/ui/haptics";
import { useTell } from "@/components/ui/toast";
import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { type DeletionRefusal, refusalOf, signsInAgainWith } from "./deletion";
import { forgetOnPhone } from "./leave";
import { useOwnAccount } from "./use-own-account";

/**
 * What deletes the account, from the step that says what goes: decision 071. The API judges
 * whether the session is fresh enough, by its own clock. Once the account is gone, the phone
 * lets go of its cookie and forgets whatever it kept for the account, as signing out does, and
 * the map opens again for a visitor (decision 070).
 */
export function useAccountDeletion() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const own = useOwnAccount();
  const offered = useOfferedProviders();
  const remove = useMutation(orpc.v1.account.delete.mutationOptions());
  const [refused, setRefused] = useState<DeletionRefusal>();
  const [signingIn, setSigningIn] = useState<Provider>();
  const account = own.account;

  async function deleteAccount(password: string | undefined) {
    setRefused(undefined);
    try {
      await remove.mutateAsync(password === undefined ? {} : { password });
    } catch (error) {
      feel("failed");
      setRefused(refusalOf(error));
      return;
    }
    // The account and its sessions are gone: the keychain lets go of the cookie, and the phone
    // of what it loaded and kept for the account.
    await authClient
      .signOut({ fetchOptions: { headers: { "X-App": appHeader() } } })
      .catch(() => null);
    forgetOnPhone(queryClient);
    tell({ title: m.delete_account_done(), tone: "success" });
    router.replace("/");
  }

  async function signInAgain(provider: Provider) {
    setSigningIn(provider);
    const outcome = await signInWith(provider).catch(() => ({
      signedIn: false as const,
      refusal: m.auth_failed(),
    }));
    setSigningIn(undefined);
    if (outcome.signedIn) {
      // A session that was just opened: the API takes the deletion from it.
      setRefused(undefined);
      feel("done");
    } else if (outcome.refusal) {
      tell({ title: outcome.refusal, tone: "danger" });
    }
  }

  return {
    account,
    isPending: own.isPending,
    hasPassword: account?.hasPassword,
    signsInAgainWith: signsInAgainWith(account?.signsInWith ?? [], offered),
    isDeleting: remove.isPending,
    signingIn,
    refused,
    onDelete: (password: string | undefined) => void deleteAccount(password),
    onSignInAgain: (provider: Provider) => void signInAgain(provider),
  };
}
