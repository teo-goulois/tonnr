import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

const EVERY = 60 * 1000;

/**
 * What waits for the operator in the moderation: the spots their owners asked to make public,
 * the contributions to the guides that are to be read or that someone contested, and the reports
 * the checks left to an operator or the flags hid. The bar counts them beside the page that
 * answers them, and the page beside each of its kinds.
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
  const reports = useQuery(orpc.v1.reports.waiting.queryOptions(options));
  return {
    spots: spots.data?.publications.length ?? 0,
    guides: (unread.data?.total ?? 0) + (contested.data?.total ?? 0),
    reports: (reports.data?.review ?? 0) + (reports.data?.hidden ?? 0),
  };
}
