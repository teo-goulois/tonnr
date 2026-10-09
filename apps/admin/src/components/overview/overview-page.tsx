import { Link } from "@tanstack/react-router";

import { BreakdownTable } from "@/components/usage/breakdown-table";
import { RangePicker } from "@/components/usage/range-picker";
import { UsageSummary } from "@/components/usage/usage-summary";
import type { BreakdownRow } from "@/lib/api";
import type { Range, RangeName, UsagePoint } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";

type OverviewPageProps = {
  rangeName: RangeName;
  onRangeChange: (range: RangeName) => void;
  range: Range;
  // Each is undefined while it loads.
  points: UsagePoint[] | undefined;
  byVia: BreakdownRow[] | undefined;
  byDeveloper: BreakdownRow[] | undefined;
  byProcedure: BreakdownRow[] | undefined;
};

// Who a count belongs to, in words.
const VIA: Record<string, () => string> = {
  key: m.via_key,
  session: m.via_session,
  none: m.via_none,
};

/** The calls the instance took: how many, from whom, and for what. */
export function OverviewPage({
  rangeName,
  onRangeChange,
  range,
  points,
  byVia,
  byDeveloper,
  byProcedure,
}: OverviewPageProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h1 className="text-l font-medium">{m.usage_title()}</h1>
        <RangePicker value={rangeName} onChange={onRangeChange} />
      </div>

      <UsageSummary range={range} points={points} />

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.usage_by_via()}</h2>
        <BreakdownTable
          heading={m.usage_caller()}
          rows={byVia}
          label={(row) => VIA[row.id ?? ""]?.() ?? row.id}
          empty={m.usage_empty()}
        />
      </section>

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.nav_developers()}</h2>
        <BreakdownTable
          heading={m.developer_name()}
          rows={byDeveloper}
          label={(row) =>
            row.id === null ? (
              m.usage_no_developer()
            ) : (
              <Link
                to="/developers/$developerId"
                params={{ developerId: row.id }}
                className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
              >
                {row.name}
              </Link>
            )
          }
          empty={m.usage_empty_keys()}
        />
      </section>

      <section className="grid grid-cols-1 gap-s">
        <h2 className="text-m font-medium">{m.usage_by_procedure()}</h2>
        <BreakdownTable
          heading={m.usage_procedure()}
          rows={byProcedure}
          label={(row) => <code className="font-mono">{row.id}</code>}
          empty={m.usage_empty()}
        />
      </section>
    </>
  );
}
