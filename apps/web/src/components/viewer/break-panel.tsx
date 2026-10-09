import { m } from "@/paraglide/messages.js";

import { PointConditions, type PointConditionsProps, Sources } from "./point-conditions";
import { DetailsPrototype, PrototypeSwitcher, useVariant } from "./prototype/prototype-switcher";
import type { Loadable, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
};

/** The wave forecast and the tide at a surf break of the catalogue. */
export function BreakPanel({
  now,
  found,
  forecast,
  tides,
  extremes,
  onTideExtend,
}: BreakPanelProps) {
  const variant = useVariant();
  // A break that has left the catalogue may still be in the cache, so the error comes first.
  if (found.isError) return <p className="text-s text-neutral-7">{m.break_not_found()}</p>;

  const sources = (
    <Sources
      origin={found.data && m.source_break({ attribution: found.data.source.attribution })}
      license={found.data?.source.license}
      forecast={forecast.data}
      tides={tides.data}
    />
  );

  // PROTOTYPE: a variant of the panel, chosen in the address. See prototype/details-prototype.tsx.
  if (variant) {
    return (
      <div className="grid gap-l">
        <DetailsPrototype
          variant={variant}
          now={now}
          forecast={forecast}
          tides={tides}
          extremes={extremes}
          onTideExtend={onTideExtend}
          footer={sources}
        />
        <PrototypeSwitcher />
      </div>
    );
  }

  return (
    <div className="grid gap-l">
      <PrototypeSwitcher />
      <PointConditions
        now={now}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        onTideExtend={onTideExtend}
      />
      {sources}
    </div>
  );
}
