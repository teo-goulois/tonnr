import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { GuideReviews, REVIEW_QUEUES } from "@/components/moderation/guide-reviews";
import { ModerationPage, SpotRequests } from "@/components/moderation/moderation-page";
import { useNow } from "@/lib/use-now";
import { useWaiting } from "@/lib/use-waiting";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/moderation")({
  validateSearch: z.object({
    // The spots their owners asked to make public, unless the address asks for what accounts
    // wrote of the breaks.
    kind: z.enum(["spots", "guides"]).optional().catch(undefined),
    // The requests that wait, unless the address asks for those that were answered.
    status: z.enum(["pending", "accepted", "refused"]).optional().catch(undefined),
    // The contributions that wait to be read, unless the address asks for others.
    queue: z.enum(REVIEW_QUEUES).optional().catch(undefined),
  }),
  component: ModerationRoute,
});

const EVERY = 60 * 1000;

function ModerationRoute() {
  const { kind = "spots", status = "pending", queue = "pending" } = Route.useSearch();
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
      ) : (
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
      )}
    </ModerationPage>
  );
}
