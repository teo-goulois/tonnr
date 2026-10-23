import { asksIfFree } from "@repo/client/username";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { usernameRefusal } from "./username";

// How long typing must have stopped before the API is asked whether a username is free.
const ASK_WAIT_MS = 400;

/**
 * Whether a username is free, asked of the sign-in library once typing has stopped, as the web
 * asks it. Undefined while it is not known, for a text that is no username, and for the
 * account's own.
 */
export function useUsernameFree(username: string, own?: string | null) {
  const [answer, setAnswer] = useState<{ of: string; isFree: boolean }>();
  const asks = asksIfFree(username, own);

  useEffect(() => {
    if (!asks) return;
    let isStale = false;
    const timer = setTimeout(() => {
      authClient
        .isUsernameAvailable({ username })
        .then((result) => {
          if (!isStale && result.data) setAnswer({ of: username, isFree: result.data.available });
        })
        // No answer says nothing: the API says it when the username is sent.
        .catch(() => {});
    }, ASK_WAIT_MS);
    return () => {
      isStale = true;
      clearTimeout(timer);
    };
  }, [asks, username]);

  return asks && answer?.of === username ? answer.isFree : undefined;
}

/**
 * Gives the signed-in account a username, its first or another. It answers why it was refused,
 * in the reader's language, or nothing once it is kept.
 */
export function useSaveUsername() {
  const queryClient = useQueryClient();

  return async function save(username: string) {
    const answer = await authClient.updateUser({ username }).catch(() => null);
    if (!answer || answer.error) {
      return usernameRefusal(answer?.error.code) ?? m.username_failed();
    }
    // What the API says of the account names it too.
    await queryClient.invalidateQueries({ queryKey: orpc.v1.account.get.key() });
    return undefined;
  };
}
