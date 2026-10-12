import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { Loadable, Standing } from "../viewer/types";

/**
 * What the signed-in account wrote in the guides, and where it stands: its score and its rank.
 * It is asked for where it shows: in the account's panel, and from the start for an account
 * that has a username, whose rank is drawn beside it. `account` is the id of the account that
 * is signed in: an answer is kept under it, since a session can become another account's in
 * another tab, and what was kept for the first is not the second's.
 */
export function useStanding({
  account,
  isAsked,
}: {
  account: string | undefined;
  isAsked: boolean;
}) {
  const asked = useQuery(
    orpc.v1.contributions.mine.queryOptions({
      queryKey: [...orpc.v1.contributions.mine.queryKey(), account],
      enabled: account !== undefined && isAsked,
      meta: { quiet: true },
    }),
  );
  const standing: Loadable<Standing> = {
    data: account === undefined ? undefined : asked.data,
    isPending: asked.isLoading,
    isError: asked.isError,
  };
  return standing;
}
