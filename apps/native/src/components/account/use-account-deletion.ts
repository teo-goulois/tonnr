import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform } from "react-native";

import {
  askApple,
  type Provider,
  signInWith,
  signInWithAppleToken,
  useOfferedProviders,
} from "@/components/auth/provider-sign-in";
import { feel } from "@/components/ui/haptics";
import { useTell } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { deleteWithApple, type DeletionRefusal, refusalOf, signsInAgainWith } from "./deletion";
import { leaveOnPhone } from "./leave";
import { useOwnAccount } from "./use-own-account";

/**
 * What deletes the account, from the step that says what goes: decision 071. The API judges
 * whether the session is fresh enough, by its own clock. On an iPhone, an account that signs in
 * with Apple asks Apple's sheet first, at every press, and its code goes with the deletion, which
 * the API exchanges to revoke what Apple gave the app; an account of those without a password
 * whose session is too old signs in again with the same sheet's token, so that one sheet does
 * both. Once the account is gone, the phone lets go of its push keys and its cookie and forgets
 * whatever it kept for the account, as signing out does, and the map opens again for a visitor
 * (decision 070).
 */
export function useAccountDeletion() {
  const queryClient = useQueryClient();
  const tell = useTell();
  const own = useOwnAccount();
  const offered = useOfferedProviders();
  const remove = useMutation(orpc.v1.account.delete.mutationOptions());
  const [refused, setRefused] = useState<DeletionRefusal>();
  const [signingIn, setSigningIn] = useState<Provider>();
  // From the press to the answer, Apple's sheet and a new sign-in included.
  const [working, setWorking] = useState(false);
  const pressed = useRef(false);
  const account = own.account;
  // Apple's sheet shows on an iPhone alone, and the instance offers it.
  const asksApple =
    Platform.OS === "ios" &&
    offered.includes("apple") &&
    (account?.signsInWith ?? []).includes("apple");

  // Whether the API deleted the account, or why it refused.
  async function send(password: string | undefined, code: string | undefined) {
    try {
      await remove.mutateAsync({
        ...(password !== undefined && { password }),
        ...(code && { appleAuthorizationCode: code }),
      });
      return undefined;
    } catch (error) {
      return refusalOf(error);
    }
  }

  // Deletes with Apple's code, after its sheet: nothing when the sheet is closed.
  async function withApple(password: string | undefined) {
    const outcome = await deleteWithApple(password, account?.id, {
      ask: askApple,
      send,
      signIn: (sheet) => signInWithAppleToken(sheet),
      signedInAs: async () =>
        (await authClient.getSession().catch(() => null))?.data?.user.id ?? undefined,
    });
    if ("deleted" in outcome) return undefined;
    if ("refused" in outcome) return outcome.refused;
    if ("other" in outcome) {
      // The phone is now signed in as that account: what it shows is read again for it.
      await queryClient.invalidateQueries();
      tell({ title: m.native_delete_account_apple_other(), tone: "danger" });
    } else if (outcome.refusal) {
      tell({ title: outcome.refusal, tone: "danger" });
    }
    return "kept" as const;
  }

  // Answers why the API refused, once it has answered, and nothing once the account is gone or
  // Apple's sheet was closed.
  async function deleteAccount(password: string | undefined) {
    if (pressed.current) return undefined;
    pressed.current = true;
    setWorking(true);
    setRefused(undefined);
    const outcome = await (asksApple ? withApple(password) : send(password, undefined)).finally(
      () => {
        pressed.current = false;
        setWorking(false);
      },
    );
    if (outcome === "kept") return undefined;
    if (outcome) {
      setRefused(outcome);
      return outcome;
    }
    // The account and its sessions are gone: the phone lets go of its push keys and its cookie,
    // and of what it loaded and kept for the account. The account's tab goes back to its first
    // screen, and the map opens for a visitor.
    await leaveOnPhone(queryClient, account?.id);
    tell({ title: m.delete_account_done(), tone: "success" });
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
    return undefined;
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
    isDeleting: working || remove.isPending,
    signingIn,
    refused,
    /**
     * Deletes the account, and answers why the API refused, or nothing once it is gone or Apple's
     * sheet was closed.
     */
    onDelete: (password: string | undefined): Promise<DeletionRefusal | undefined> =>
      deleteAccount(password),
    onSignInAgain: (provider: Provider) => void signInAgain(provider),
  };
}
