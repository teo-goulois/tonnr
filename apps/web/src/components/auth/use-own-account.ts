import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const MINUTE_MS = 60 * 1000;

/**
 * What the API says of the account that is signed in: whether its address is checked, and
 * whether this instance checks addresses. An answer is kept under the account it was asked for,
 * and given for that one alone: a session can become another account's in another tab, and what
 * was kept for the first is not the second's.
 */
export function useOwnAccount() {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const asked = useQuery(
    orpc.v1.account.get.queryOptions({
      queryKey: [...orpc.v1.account.get.queryKey(), userId],
      enabled: userId !== undefined,
      staleTime: 5 * MINUTE_MS,
      // The link of the mail opens in another tab: an address still to check is asked about
      // again when the reader comes back to this one.
      refetchOnWindowFocus: (query) => {
        const known = query.state.data;
        return known?.checksAddresses === true && !known.emailVerified ? "always" : true;
      },
      meta: { quiet: true },
    }),
  );

  // A question that waits for the network to come back is not being asked: whoever reads this
  // says what it can meanwhile, and is told when the answer comes. One that is asked again
  // after it failed leaves in place what its failure showed.
  const isAsking = asked.isPending && asked.fetchStatus !== "paused" && asked.errorUpdatedAt === 0;

  return {
    // Undefined while the browser's session is not known.
    signedIn: session.isPending ? undefined : userId !== undefined,
    // The cookie may change a moment before the session does: an answer says whose it is.
    account: asked.data?.id === userId ? asked.data : undefined,
    // The account is known a moment after the session is.
    isPending: session.isPending || (userId !== undefined && isAsking),
    /** Asks the API again, after it gave no answer. */
    retry: () => void asked.refetch(),
    isRetrying: asked.isFetching,
  };
}
