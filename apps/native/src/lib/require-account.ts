import { type Href, router } from "expo-router";
import { useCallback } from "react";

import { useAccount } from "./account";

/**
 * What a screen calls before what needs an account: it goes on at once for an account, and asks a
 * visitor to sign in, saying what for, then goes on to `then` once signed in. The web's
 * `useAuthPrompt` does the same (decisions 039 and 070). `reason` is a message's text.
 */
export function useRequireAccount() {
  const { signedIn } = useAccount();
  return useCallback(
    (reason: string, then: () => void, next?: Href) => {
      if (signedIn) return then();
      router.push({
        pathname: "/sign-in",
        params: { reason, ...(typeof next === "string" && { next }) },
      });
    },
    [signedIn],
  );
}
