import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "./auth-client";

// How long the route takes the session it last read for the one in force. A selection on the
// map is a navigation, and each navigation asks the route who it takes: without this, every
// press asked the API again. What signs in or out forgets it.
const FRESH_MS = 60 * 1000;

export const SESSION_KEY = ["auth", "session"] as const;

/** The session as the API gives it, asked again after a minute. */
export function sessionQuery() {
  return {
    queryKey: SESSION_KEY,
    queryFn: () => authClient.getSession(),
    staleTime: FRESH_MS,
    meta: { quiet: true },
  };
}

/** Forgets the session that was read: the next navigation asks the API. */
export function forgetSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: SESSION_KEY });
}
