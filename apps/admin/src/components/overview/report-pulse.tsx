import { Skeleton } from "@repo/ui/components/ui/skeleton";

import type { Overview } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Tile } from "./tile";

type ReportPulseProps = {
  // Undefined while it loads.
  overview: Overview | undefined;
};

/**
 * The reports of the week and what they told: whether accounts send them, whether those who keep
 * a break are told, and whether anyone looks. Decisions 067 and 068. What waits for an operator
 * and the accounts that turned the notifications off are counted as they stand now.
 */
export function ReportPulse({ overview }: ReportPulseProps) {
  const loading = <Skeleton className="h-8 w-16" />;
  const reports = overview?.reports;

  return (
    <section className="grid grid-cols-1 gap-s">
      <h2 className="text-m font-medium">{m.pulse_reports()}</h2>
      <dl className="grid grid-cols-2 gap-s sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label={m.pulse_reports_sent()}
          value={reports ? formatCount(reports.sent) : loading}
          note={
            reports &&
            m.pulse_reports_sent_note({
              shown: formatCount(reports.shown),
              refused: formatCount(reports.refused),
            })
          }
          to="/moderation"
          search={{ kind: "reports", state: "all" }}
        />
        <Tile
          label={m.pulse_reports_waiting()}
          value={reports ? formatCount(reports.waiting) : loading}
          note={reports && m.pulse_reports_waiting_note()}
          to="/moderation"
          search={{ kind: "reports" }}
        />
        <Tile
          label={m.pulse_reports_notices()}
          value={reports ? formatCount(reports.notices) : loading}
          note={
            reports &&
            m.pulse_reports_notices_note({
              pushed: formatCount(reports.pushed),
              read: formatCount(reports.read),
            })
          }
        />
        <Tile
          label={m.pulse_reports_views()}
          value={reports ? formatCount(reports.views) : loading}
          note={reports && m.pulse_reports_views_note({ opens: formatCount(reports.opens) })}
        />
        <Tile
          label={m.pulse_reports_off()}
          value={reports ? formatCount(reports.switchedOff) : loading}
          note={reports && m.pulse_reports_off_note()}
        />
      </dl>
    </section>
  );
}
