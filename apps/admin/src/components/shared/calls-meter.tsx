import { Meter, MeterIndicator, MeterTrack } from "@repo/ui/components/ui/meter";

import { formatCount } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

type CallsMeterProps = {
  calls: number;
  // Null: nothing limits the calls.
  limit: number | null;
  // What is counted, for a reader who does not see the meter.
  label: string;
};

/** Calls that were made, against their limit when they have one. */
export function CallsMeter({ calls, limit, label }: CallsMeterProps) {
  if (limit === null) {
    return <span className="tabular-nums">{formatCount(calls)}</span>;
  }

  const used = calls / limit;
  return (
    <Meter
      value={Math.min(calls, limit)}
      max={limit}
      aria-label={label}
      getAriaValueText={() =>
        m.calls_of_limit({ calls: formatCount(calls), limit: formatCount(limit) })
      }
      className="w-40 gap-xxs"
    >
      <span className="text-s tabular-nums">
        {m.calls_of_limit({ calls: formatCount(calls), limit: formatCount(limit) })}
      </span>
      <MeterTrack>
        <MeterIndicator level={used >= 1 ? "high" : used >= 0.8 ? "low" : "rest"} />
      </MeterTrack>
    </Meter>
  );
}
