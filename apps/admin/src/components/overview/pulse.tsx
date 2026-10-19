import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import type { Overview } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Tile } from "./tile";

type PulseProps = {
  // Undefined while it loads.
  overview: Overview | undefined;
};

// Who a count belongs to, in words, as the breakdown below names them.
const VIA: Record<string, () => string> = {
  key: m.via_key,
  session: m.via_session,
  link: m.via_link,
  visitor: m.via_visitor,
  none: m.via_none,
};

/**
 * The instance in a glance: how many people are here, how much they ask, and whether the
 * instance keeps up. Each tile leads to the page that says more.
 */
export function Pulse({ overview }: PulseProps) {
  const loading = <Skeleton className="h-8 w-16" />;
  const share = (part: { calls: number; limit: number }) =>
    `${formatCount(part.calls)} / ${formatCount(part.limit)}`;
  const percent = (part: { calls: number; limit: number }) =>
    Math.round((100 * part.calls) / part.limit);

  const people = overview?.forecasts.people;
  const callers = overview?.calls.byVia
    .filter((row) => row.calls > 0)
    .map((row) => `${VIA[row.via]?.() ?? row.via} ${formatCount(row.calls)}`)
    .join(" · ");

  return (
    <dl className="grid grid-cols-2 gap-s sm:grid-cols-3 lg:grid-cols-5">
      <Tile
        label={m.pulse_accounts()}
        value={overview ? formatCount(overview.accounts.total) : loading}
        note={
          overview &&
          m.pulse_accounts_note({
            active: formatCount(overview.accounts.activeThisWeek),
            fresh: formatCount(overview.accounts.newThisWeek),
          })
        }
        to="/accounts"
      />
      <Tile
        label={m.pulse_calls()}
        value={overview ? formatCount(overview.calls.total) : loading}
        note={overview && (callers || m.pulse_no_calls())}
      />
      <Tile
        label={m.pulse_forecasts()}
        value={people ? `${percent(people)} %` : loading}
        note={
          overview &&
          people &&
          m.pulse_forecasts_note({
            people: share(people),
            pages: share(overview.forecasts.pages),
            alerts: share(overview.forecasts.alerts),
          })
        }
        to="/instance"
      />
      <Tile
        label={m.pulse_visitors()}
        value={
          overview ? (
            <Badge variant={overview.visitors.open ? "success" : "error"}>
              {!overview.visitors.open && overview.visitors.closedAt
                ? m.visitors_closed()
                : overview.visitors.busy
                  ? m.visitors_busy()
                  : m.visitors_open()}
            </Badge>
          ) : (
            loading
          )
        }
        note={overview && m.pulse_visitors_note()}
        to="/instance"
      />
      <Tile
        label={m.pulse_worker()}
        value={
          overview ? (
            <Badge variant={overview.worker.running ? "success" : "error"}>
              {overview.worker.running ? m.program_running() : m.program_stopped()}
            </Badge>
          ) : (
            loading
          )
        }
        note={
          overview &&
          (overview.worker.late + overview.worker.failed === 0
            ? m.pulse_jobs_fine()
            : m.pulse_jobs_note({
                late: formatCount(overview.worker.late),
                failed: formatCount(overview.worker.failed),
              }))
        }
        to="/instance"
      />
    </dl>
  );
}
