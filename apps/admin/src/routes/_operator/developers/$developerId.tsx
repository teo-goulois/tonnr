import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ActionsTable } from "@/components/activity/actions-table";
import { DeveloperPage } from "@/components/developers/developer-page";
import { Loader } from "@/components/shared/loader";
import { NotFound } from "@/components/shared/not-found";
import { BreakdownTable } from "@/components/usage/breakdown-table";
import { RangePicker } from "@/components/usage/range-picker";
import { UsageSummary } from "@/components/usage/usage-summary";
import { useNow, useRange } from "@/lib/use-now";
import { useUsageBreakdown, useUsageSeries } from "@/lib/use-usage";
import { type RangeName, isRangeName, rangeNameOf } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_operator/developers/$developerId")({
  validateSearch: (search): { range?: RangeName } => ({
    // The day is what an address without a span means, so it is not written there.
    range: isRangeName(search.range) && search.range !== "day" ? search.range : undefined,
  }),
  component: DeveloperRoute,
});

const EVERY = 30 * 1000;

function DeveloperRoute() {
  const { developerId } = Route.useParams();
  // A screen of its own for each account: what was loaded for one is not drawn for another.
  return <DeveloperScreen key={developerId} developerId={developerId} />;
}

function DeveloperScreen({ developerId }: { developerId: string }) {
  const rangeName = rangeNameOf(Route.useSearch().range);
  const navigate = useNavigate({ from: Route.fullPath });
  const now = useNow();
  const range = useRange(rangeName);

  const developers = useQuery(orpc.v1.developers.list.queryOptions({ refetchInterval: EVERY }));
  const keys = useQuery(
    orpc.v1.keys.list.queryOptions({ input: { developerId }, refetchInterval: EVERY }),
  );
  const members = useQuery(
    orpc.v1.developers.members.queryOptions({
      input: { id: developerId },
      refetchInterval: EVERY,
      // The screen says itself that the developer account does not exist.
      meta: { quietWhenMissing: true },
    }),
  );
  const filter = { developerId };
  const series = useUsageSeries(range, filter);
  const byKey = useUsageBreakdown(range, "key", filter);
  const byProcedure = useUsageBreakdown(range, "procedure", filter);
  // What was done to the account, to its keys and to its members, the latest first. The page
  // of the activity has all of it.
  const history = useQuery(
    orpc.v1.actions.list.queryOptions({ input: { developerId, limit: 20 } }),
  );

  const developer = developers.data?.developers.find((found) => found.id === developerId);
  if (!developers.data) return <Loader />;
  if (!developer) return <NotFound />;

  return (
    <DeveloperPage
      developer={developer}
      keys={keys.data?.keys}
      members={members.data?.members}
      now={now.getTime()}
      onDeleted={() => void navigate({ to: "/developers" })}
    >
      <section className="grid grid-cols-1 gap-l">
        <div className="flex flex-wrap items-center justify-between gap-s">
          <h2 className="text-m font-medium">{m.usage_title()}</h2>
          <RangePicker
            value={rangeName}
            onChange={(next) =>
              void navigate({ search: next === "day" ? {} : { range: next }, replace: true })
            }
          />
        </div>
        <UsageSummary range={range} points={series.data?.points} />
        <div className="grid grid-cols-1 gap-s">
          <h3 className="text-s font-medium text-neutral-7">{m.usage_by_key()}</h3>
          <BreakdownTable heading={m.key_name()} rows={byKey.data?.rows} empty={m.usage_empty()} />
        </div>
        <div className="grid grid-cols-1 gap-s">
          <h3 className="text-s font-medium text-neutral-7">{m.usage_by_procedure()}</h3>
          <BreakdownTable
            heading={m.usage_procedure()}
            rows={byProcedure.data?.rows}
            label={(row) => <code className="font-mono">{row.id}</code>}
            empty={m.usage_empty()}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.developer_history()}</h2>
        <ActionsTable actions={history.data?.actions} empty={m.activity_empty()} />
      </section>
    </DeveloperPage>
  );
}
