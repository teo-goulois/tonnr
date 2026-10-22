import { useQuery } from "@tanstack/react-query";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

/**
 * What the signed-in account wrote in the guides, and where it stands: its score and its rank,
 * as the web's `useStanding` asks it. One question for the account's tab, whose row says the
 * points and the rank, and for the step that lists the contributions, so that a pull on either
 * reads both again. It is kept under the account that is signed in: another account that signs in
 * on the phone is not shown the first one's.
 */
export function useStanding() {
  const { signedIn, userId } = useAccount();
  return useQuery(
    orpc.v1.contributions.mine.queryOptions({
      queryKey: [...orpc.v1.contributions.mine.queryKey(), userId],
      enabled: signedIn && userId !== undefined,
      retry: false,
    }),
  );
}
