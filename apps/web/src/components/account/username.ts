import {
  asksIfFree,
  typedUsername,
  usernameFault as faultIn,
  type UsernameMessages,
  usernameRefusal as refusalIn,
} from "@repo/client/username";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// The rules of a username, which `packages/client/src/username.ts` says for both apps, in this
// app's words.

// How long typing must have stopped before the API is asked whether a username is free.
const ASK_WAIT_MS = 400;

/** The words of a username's faults, from this app's messages. */
export const USERNAME_WORDS: UsernameMessages = {
  username_too_short: m.username_too_short,
  username_too_long: m.username_too_long,
  username_characters: m.username_characters,
  username_reserved: m.username_reserved,
  username_taken: m.username_taken,
};

/** What is typed as a username, as it is kept: in small letters. */
export { typedUsername };

/** Why a text is no username, in the reader's language. Undefined for one that is. */
export const usernameFault = (username: string) => faultIn(username, USERNAME_WORDS);

/**
 * What a refusal of the sign-in library says of a username, in the reader's language. Undefined
 * for a refusal of something else, which the library words itself.
 */
export const usernameRefusal = (code: string | undefined) => refusalIn(code, USERNAME_WORDS);

/**
 * Whether a username is free, asked of the API once typing has stopped. Undefined while it is
 * not known, for a text that is no username, and for the account's own.
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
        // No answer says nothing: the API says when the username is sent.
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
 * Gives the signed-in account a username, its first or another. `save` answers why it was
 * refused, in the reader's language, or nothing once it is kept.
 */
export function useUsername() {
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
