import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { InstancePage } from "@/components/instance/instance-page";
import { useNow } from "@/lib/use-now";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/instance")({
  // `visitors` opens the dialog that closes the app to visitors, or the one that opens it to
  // them: the command palette comes here with it, from any page.
  validateSearch: (search): { visitors?: "close" | "open" } => ({
    visitors:
      search.visitors === "close" || search.visitors === "open" ? search.visitors : undefined,
  }),
  component: InstanceRoute,
});

// The worker says it is there every thirty seconds.
const EVERY = 30 * 1000;

function InstanceRoute() {
  const now = useNow(EVERY);
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const asking = Route.useSearch().visitors;
  const state = useQuery(orpc.v1.instance.state.queryOptions({ refetchInterval: EVERY }));
  const change = useMutation(
    orpc.v1.visitors.update.mutationOptions({
      // The page says since when at once, and the record of what was done has one more line.
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.v1.instance.state.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.v1.actions.list.key() }),
        ]),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <InstancePage
      state={state.data}
      now={now.getTime()}
      askingVisitors={asking}
      onAskingVisitorsChange={(visitors) =>
        void navigate({ search: visitors ? { visitors } : {}, replace: true })
      }
      onVisitorsChange={(open) => change.mutateAsync({ open })}
    />
  );
}
