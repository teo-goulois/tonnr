import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GuideReviews, REVIEW_QUEUES } from "@/components/moderation/guide-reviews";
import { ModerationPage, SpotRequests } from "@/components/moderation/moderation-page";
import { REPORT_FILTERS, WaveReports } from "@/components/moderation/wave-reports";
import { useNow } from "@/lib/use-now";
import { useWaiting } from "@/lib/use-waiting";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/moderation")({
  validateSearch: z.object({
    // The spots their owners asked to make public, unless the address asks for what accounts
    // wrote of the breaks, or for the reports of the waves they sent from them.
    kind: z.enum(["spots", "guides", "reports"]).optional().catch(undefined),
    // The requests that wait, unless the address asks for those that were answered.
    status: z.enum(["pending", "accepted", "refused"]).optional().catch(undefined),
    // The contributions that wait to be read, unless the address asks for others.
    queue: z.enum(REVIEW_QUEUES).optional().catch(undefined),
    // The reports left to an operator, unless the address asks for others.
    state: z.enum(REPORT_FILTERS).optional().catch(undefined),
  }),
  component: ModerationRoute,
});

const EVERY = 60 * 1000;

function ModerationRoute() {
  const {
    kind = "spots",
    status = "pending",
    queue = "pending",
    state = "review",
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useNow();
  const publications = useQuery(
    orpc.v1.publications.list.queryOptions({
      input: { status },
      enabled: kind === "spots",
      refetchInterval: EVERY,
    }),
  );
  const reviews = useQuery(
    orpc.v1.reviews.list.queryOptions({
      input: { queue },
      enabled: kind === "guides",
      refetchInterval: EVERY,
    }),
  );
  const reports = useInfiniteQuery(
    orpc.v1.reports.review.infiniteOptions({
      input: (before: Date | undefined) => ({
        state: state === "all" ? undefined : state,
        before,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.next ?? undefined,
      enabled: kind === "reports",
      refetchInterval: EVERY,
    }),
  );
  // What waits of each kind, whichever is in view: the layout asks the same, for the bar.
  const waiting = useWaiting();

  return (
    <ModerationPage
      kind={kind}
      onKindChange={(next) => void navigate({ search: next === "spots" ? {} : { kind: next } })}
      waiting={waiting}
    >
      {kind === "spots" ? (
        <SpotRequests
          status={status}
          onStatusChange={(next) =>
            void navigate({ search: next === "pending" ? {} : { status: next } })
          }
          publications={publications.data?.publications}
          now={now.getTime()}
        />
      ) : kind === "guides" ? (
        <GuideReviews
          queue={queue}
          onQueueChange={(next) =>
            void navigate({
              search: next === "pending" ? { kind: "guides" } : { kind: "guides", queue: next },
            })
          }
          reviews={reviews.data?.reviews}
          total={reviews.data?.total ?? 0}
          now={now.getTime()}
        />
      ) : (
        <WaveReports
          filter={state}
          onFilterChange={(next) =>
            void navigate({
              search: next === "review" ? { kind: "reports" } : { kind: "reports", state: next },
            })
          }
          reports={reports.data?.pages.flatMap((page) => page.reports)}
          onMore={reports.hasNextPage ? () => void reports.fetchNextPage() : undefined}
          isLoadingMore={reports.isFetchingNextPage}
          now={now.getTime()}
        />
      )}
    </ModerationPage>
  );
}
