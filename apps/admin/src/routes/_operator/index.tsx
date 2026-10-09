import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { OverviewPage } from "@/components/overview/overview-page";
import { useRange } from "@/lib/use-now";
import { useUsageBreakdown, useUsageSeries } from "@/lib/use-usage";
import { type RangeName, isRangeName, rangeNameOf } from "@/lib/usage";

export const Route = createFileRoute("/_operator/")({
  // How far back the counts go is in the address, so that a view can be kept or sent.
  validateSearch: (search): { range?: RangeName } => ({
    // The day is what an address without a span means, so it is not written there.
    range: isRangeName(search.range) && search.range !== "day" ? search.range : undefined,
  }),
  component: OverviewRoute,
});

function OverviewRoute() {
  const rangeName = rangeNameOf(Route.useSearch().range);
  const navigate = useNavigate({ from: Route.fullPath });
  const range = useRange(rangeName);

  const series = useUsageSeries(range);
  const byVia = useUsageBreakdown(range, "via");
  const byDeveloper = useUsageBreakdown(range, "developer");
  const byProcedure = useUsageBreakdown(range, "procedure");

  return (
    <OverviewPage
      rangeName={rangeName}
      onRangeChange={(next) =>
        void navigate({ search: next === "day" ? {} : { range: next }, replace: true })
      }
      range={range}
      points={series.data?.points}
      byVia={byVia.data?.rows}
      byDeveloper={byDeveloper.data?.rows}
      byProcedure={byProcedure.data?.rows}
    />
  );
}
