import { type Href, router } from "expo-router";
import { useCallback } from "react";

import { useAccount } from "./account";

// What a visitor asked for and signs in for, which the sign-in sheet that prompt opened goes on
// to once signed in, as the web's prompt runs its `onSignedIn`: the next prompt replaces it, and
// a sheet that closes without signing in, or one opened from elsewhere, never runs it.
let followUp: { sheet: string; goOn: () => void } | undefined;
let prompts = 0;

/** What the sign-in sheet `sheet` goes on to once signed in, taken once. */
export function takeFollowUp(sheet: string | undefined): (() => void) | undefined {
  if (!sheet || followUp?.sheet !== sheet) return undefined;
  const { goOn } = followUp;
  followUp = undefined;
  return goOn;
}

/**
 * What a screen calls before what needs an account: it goes on at once for an account, and asks a
 * visitor to sign in, saying what for, then goes on to `then` once signed in, or to `next`, a
 * route, when one is given. The web's `useAuthPrompt` does the same (decisions 039 and 070).
 * `reason` is a message's text.
 */
export function useRequireAccount() {
  const { signedIn } = useAccount();
  return useCallback(
    (reason: string, then: () => void, next?: Href) => {
      if (signedIn) return then();
      prompts += 1;
      const sheet = String(prompts);
      followUp = typeof next === "string" ? undefined : { sheet, goOn: then };
      router.push({
        pathname: "/sign-in",
        params: { reason, follow: sheet, ...(typeof next === "string" && { next }) },
      });
    },
    [signedIn],
  );
}
