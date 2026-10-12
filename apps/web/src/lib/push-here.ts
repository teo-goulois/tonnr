import { client } from "@/utils/orpc";

import { authClient } from "./auth-client";
import { leftPush, thisBrowser } from "./push";
import { pushApiOf } from "./push-api";

// How long signing out waits for the browser to let go of its subscription.
const LEFT_WAIT_MS = 5000;

/**
 * The API's part of push, as this app calls it. Who is signed in is asked anew each time, of
 * the API and not of what this tab remembers: another tab may have changed it. An answer that
 * does not come in time is no answer.
 */
export const pushApi = pushApiOf(client.v1.push, async ({ signal }) => {
  const { data, error } = await authClient.getSession({
    query: { disableCookieCache: true },
    fetchOptions: { signal },
  });
  if (error) throw new Error("Who is signed in could not be asked");
  return data?.user.id ?? null;
});

/**
 * What this browser does once its account has signed out: `leftPush` says what. A browser that
 * is slow to let go does not keep the account on the page: it goes on letting go while the page
 * moves on.
 */
export function leftPushHere() {
  return Promise.race([
    leftPush(thisBrowser),
    new Promise((resolve) => setTimeout(resolve, LEFT_WAIT_MS)),
  ]);
}
