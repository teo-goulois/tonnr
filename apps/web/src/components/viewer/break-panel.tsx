import { m } from "@/paraglide/messages.js";

import { PointConditions, type PointConditionsProps, Sources } from "./point-conditions";
import type { Loadable, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
};

/** The wave forecast and the tide at a surf break of the catalogue. */
export function BreakPanel({ now, found, forecast, tides, extremes, tideDay }: BreakPanelProps) {
  // A break that has left the catalogue may still be in the cache, so the error comes first.
  if (found.isError) return <p className="text-s text-neutral-7">{m.break_not_found()}</p>;

  return (
    <div className="grid gap-l">
      <PointConditions
        now={now}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        tideDay={tideDay}
      />
      <Sources
        origin={found.data && m.source_break({ attribution: found.data.source.attribution })}
        license={found.data?.source.license}
        forecast={forecast.data}
        tides={tides.data}
      />
    </div>
  );
}
