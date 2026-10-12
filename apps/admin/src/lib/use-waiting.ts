import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

const EVERY = 60 * 1000;

/**
 * What waits for the operator in the moderation: the spots their owners asked to make public,
 * and the contributions to the guides that are to be read or that someone contested. The bar
 * counts them beside the page that answers them, and the page beside each of its two kinds.
 */
export function useWaiting() {
  const options = { refetchInterval: EVERY, meta: { quiet: true } };
  const spots = useQuery(
    orpc.v1.publications.list.queryOptions({ input: { status: "pending" }, ...options }),
  );
  const unread = useQuery(
    orpc.v1.reviews.list.queryOptions({ input: { queue: "pending" }, ...options }),
  );
  const contested = useQuery(
    orpc.v1.reviews.list.queryOptions({ input: { queue: "contested" }, ...options }),
  );
  return {
    spots: spots.data?.publications.length ?? 0,
    guides: (unread.data?.total ?? 0) + (contested.data?.total ?? 0),
  };
}
