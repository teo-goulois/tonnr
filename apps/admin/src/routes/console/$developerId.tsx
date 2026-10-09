import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ConsoleDeveloperPage } from "@/components/console/console-developer-page";
import { ConsoleMissing } from "@/components/console/console-missing";
import { Loader } from "@/components/shared/loader";
import { BreakdownTable } from "@/components/usage/breakdown-table";
import { RangePicker } from "@/components/usage/range-picker";
import { UsageSummary } from "@/components/usage/usage-summary";
import { useNow, useRange } from "@/lib/use-now";
import { useConsoleBreakdown, useConsoleSeries } from "@/lib/use-usage";
import { type Range, type RangeName, isRangeName, rangeNameOf } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";
import { isMissing, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/console/$developerId")({
  validateSearch: (search): { range?: RangeName } => ({
    // The day is what an address without a span means, so it is not written there.
    range: isRangeName(search.range) && search.range !== "day" ? search.range : undefined,
  }),
  component: ConsoleDeveloperRoute,
});

function ConsoleDeveloperRoute() {
  const { developerId } = Route.useParams();
  // A screen of its own for each account: what was loaded for one is not drawn for another.
  return <ConsoleDeveloperScreen key={developerId} developerId={developerId} />;
}

function ConsoleDeveloperScreen({ developerId }: { developerId: string }) {
  const rangeName = rangeNameOf(Route.useSearch().range);
  const navigate = useNavigate({ from: Route.fullPath });
  const now = useNow();
  const range = useRange(rangeName);

  // The layout asks for it again every thirty seconds: this reads what it holds. A developer
  // account that is no longer in it leaves the screen, and the layout drops what was read of
  // its calls.
  const mine = useQuery(orpc.v1.console.get.queryOptions());
  const developer = mine.data?.developers.find((found) => found.id === developerId);

  if (!mine.data) return <Loader />;
  if (!developer) return <ConsoleMissing />;

  return (
    <ConsoleDeveloperPage developer={developer} now={now.getTime()}>
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
        <ConsoleCalls developerId={developerId} range={range} />
      </section>
    </ConsoleDeveloperPage>
  );
}

/** The calls of the developer account's keys, as the admin draws an operator's. */
function ConsoleCalls({ developerId, range }: { developerId: string; range: Range }) {
  const queryClient = useQueryClient();
  const series = useConsoleSeries(range, developerId);
  const byKey = useConsoleBreakdown(range, "key", developerId);
  const byProcedure = useConsoleBreakdown(range, "procedure", developerId);

  // The API answers that there is no such developer account: the reader is no longer one of
  // its members. The answer is enough to take the developer account off the screen, its name
  // and its keys with its calls: it is struck from what the page holds, without waiting for
  // the API to say again what the reader is a member of. That is asked as well.
  const lost = [series, byKey, byProcedure].some((asked) => isMissing(asked.error));
  useEffect(() => {
    if (!lost) return;
    queryClient.setQueryData(orpc.v1.console.get.queryKey(), (held) =>
      held ? { developers: held.developers.filter((found) => found.id !== developerId) } : held,
    );
    void queryClient.invalidateQueries({ queryKey: orpc.v1.console.get.key() });
  }, [lost, developerId, queryClient]);
  if (lost) return null;

  return (
    <>
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
    </>
  );
}
