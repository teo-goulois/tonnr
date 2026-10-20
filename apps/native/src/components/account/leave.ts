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
 * Signs the account out on this phone: the session ends at the API, its cookie leaves the
 * keychain, and the phone forgets what it kept for the account. The library's client lets go of
 * the cookie before it asks the API, so the phone is signed out whatever the API answers: a
 * session the API could not end then ends at its time, with no cookie left here to use it.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await authClient
      .signOut({ fetchOptions: { headers: { "X-App": appHeader() } } })
      .catch(() => null);
    forgetOnPhone(queryClient);
  }, [queryClient]);
}
