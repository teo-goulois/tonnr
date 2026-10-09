import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";

import { ConsoleListPage } from "@/components/console/console-list-page";
import { Loader } from "@/components/shared/loader";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/console/")({
  component: ConsoleRoute,
});

function ConsoleRoute() {
  // The layout asks for it again every thirty seconds: this reads what it holds.
  const mine = useQuery(orpc.v1.console.get.queryOptions());
  const developers = mine.data?.developers;
  if (!developers) return <Loader />;

  // A member of one developer account goes straight to it.
  const [only] = developers;
  if (only && developers.length === 1) {
    return <Navigate to="/console/$developerId" params={{ developerId: only.id }} replace />;
  }
  return <ConsoleListPage developers={developers} />;
}
