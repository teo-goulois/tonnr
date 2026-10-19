import { FRESH_SIGN_IN_MINUTES } from "@repo/config/account";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import type { AccountDeletion, DeletionRefusal } from "@/components/account/delete-account";
import { signInWith, useSignInProviders } from "@/components/auth/provider-sign-in";
import { resetAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { leftPushHere } from "@/lib/push-here";
import { clearRecents } from "@/lib/recents";
import { leaveWith } from "@/lib/unsaved";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// Deleting the account, from the step of its panel that says what goes: decision 071.

/** Why the API did not delete the account, as its refusal says. */
function refusalOf(error: unknown): DeletionRefusal {
  const refused = error as { code?: string; data?: { refused?: string } };
  if (refused.code === "FORBIDDEN") {
    return refused.data?.refused === "session" ? "session" : "password";
  }
  if (refused.code === "TOO_MANY_REQUESTS") return "many";
  if (refused.code === "CONFLICT") return "operator";
  return "failed";
}

type Asked = {
  // Whether the account has a password, once the API has said.
  hasPassword: boolean | undefined;
  // When this browser's session was opened.
  openedAt: Date | string | undefined;
};

/**
 * What deletes the account. Once it is gone, the browser forgets the session and what it loaded
 * for it, as signing out does, and the map opens again for a visitor.
 */
export function useAccountDeletion({ hasPassword, openedAt }: Asked): AccountDeletion {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const providers = useSignInProviders();
  const remove = useMutation(orpc.v1.account.delete.mutationOptions());
  const [refused, setRefused] = useState<DeletionRefusal>();
  const [isSigningIn, setSigningIn] = useState(false);
  const opened = openedAt === undefined ? Number.NaN : new Date(openedAt).getTime();

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
    hasPassword,
    isFresh: Date.now() - opened < FRESH_SIGN_IN_MINUTES * 60 * 1000,
    offersGoogle: providers.data?.google === true,
    isDeleting: remove.isPending,
    isSigningIn,
    refused,
    // Whatever was written and not saved is asked about first: once the account goes, there is
    // no staying.
    onDelete: (password) => leaveWith(() => void deleteAccount(password)),
    onSignInAgain: () => {
      setSigningIn(true);
      void signInWith("google")
        .then((left) => {
          if (!left) toast.error(m.auth_failed());
        })
        .catch(() => toast.error(m.auth_failed()))
        .finally(() => setSigningIn(false));
    },
  };
}
