import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { InstancePage } from "@/components/instance/instance-page";
import { useNow } from "@/lib/use-now";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/instance")({
  component: InstanceRoute,
});

// The worker says it is there every thirty seconds.
const EVERY = 30 * 1000;

function InstanceRoute() {
  const now = useNow(EVERY);
  const state = useQuery(orpc.v1.instance.state.queryOptions({ refetchInterval: EVERY }));

  return <InstancePage state={state.data} now={now.getTime()} />;
}
