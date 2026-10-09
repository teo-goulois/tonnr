import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { ActivityPage } from "@/components/activity/activity-page";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/activity")({
  component: ActivityRoute,
});

function ActivityRoute() {
  const actions = useInfiniteQuery(
    orpc.v1.actions.list.infiniteOptions({
      input: (after: string | undefined) => ({ after }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
    }),
  );
  // A record names an account that may be gone since: only the ones that exist are links.
  const developers = useQuery(orpc.v1.developers.list.queryOptions());
  const existing = useMemo(
    () => new Set(developers.data?.developers.map((developer) => developer.id)),
    [developers.data],
  );

  return (
    <ActivityPage
      actions={actions.data?.pages.flatMap((page) => page.actions)}
      existing={existing}
      onMore={actions.hasNextPage ? () => void actions.fetchNextPage() : undefined}
      isLoadingMore={actions.isFetchingNextPage}
    />
  );
}
