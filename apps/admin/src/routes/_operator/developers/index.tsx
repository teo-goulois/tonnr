import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DevelopersPage } from "@/components/developers/developers-page";
import { useNow } from "@/lib/use-now";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/developers/")({
  component: DevelopersRoute,
});

// The calls of the hour and the last use move while the page is open.
const EVERY = 30 * 1000;

function DevelopersRoute() {
  const navigate = useNavigate();
  const now = useNow();
  const developers = useQuery(orpc.v1.developers.list.queryOptions({ refetchInterval: EVERY }));
  const keys = useQuery(orpc.v1.keys.list.queryOptions({ input: {}, refetchInterval: EVERY }));

  return (
    <DevelopersPage
      developers={developers.data?.developers}
      orphanKeys={keys.data?.keys.filter((key) => key.developerId === null) ?? []}
      now={now.getTime()}
      onCreated={(developer) =>
        void navigate({ to: "/developers/$developerId", params: { developerId: developer.id } })
      }
    />
  );
}
