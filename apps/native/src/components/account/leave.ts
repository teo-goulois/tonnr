import { RECENTS_KEY } from "@repo/client/recents";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { appHeader } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";

/**
 * Forgets on the phone what was kept for an account that is no longer signed in here: what was
 * loaded for it, and what it looked at last. The session's cookie goes with the sign-out, from
 * the keychain. The units, the theme and the language stay: they are the phone's, as a browser
 * keeps them. Decision 070.
 */
export function forgetOnPhone(queryClient: QueryClient) {
  queryClient.clear();
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    // A phone that keeps nothing has nothing to forget.
  }
}

/**
 * Signs the account out on this phone: the session ends at the API and its cookie leaves the
 * keychain, then the phone forgets what it kept for the account. True once it is done; a
 * sign-out that did not happen leaves everything as it was.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const answer = await authClient
      .signOut({ fetchOptions: { headers: { "X-App": appHeader() } } })
      .catch(() => null);
    if (!answer || answer.error) return false;
    forgetOnPhone(queryClient);
    return true;
  }, [queryClient]);
}
