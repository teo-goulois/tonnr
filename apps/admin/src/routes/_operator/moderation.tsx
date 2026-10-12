import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ModerationPage } from "@/components/moderation/moderation-page";
import { useNow } from "@/lib/use-now";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/moderation")({
  // The requests that wait, unless the address asks for those that were answered.
  validateSearch: z.object({
    status: z.enum(["pending", "accepted", "refused"]).optional().catch(undefined),
  }),
  component: ModerationRoute,
});

const EVERY = 60 * 1000;

function ModerationRoute() {
  const { status = "pending" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useNow();
  const publications = useQuery(
    orpc.v1.publications.list.queryOptions({ input: { status }, refetchInterval: EVERY }),
  );

  return (
    <ModerationPage
      status={status}
      onStatusChange={(next) =>
        void navigate({ search: next === "pending" ? {} : { status: next } })
      }
      publications={publications.data?.publications}
      now={now.getTime()}
    />
  );
}
