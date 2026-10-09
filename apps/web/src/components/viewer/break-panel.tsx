import { m } from "@/paraglide/messages.js";

import { BreakCharacteristics } from "./break-characteristics";
import { PointConditions, type PointConditionsProps, Sources } from "./point-conditions";
import { DetailsPrototype, PrototypeSwitcher, useVariant } from "./prototype/prototype-switcher";
import type { Loadable, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
};

/** The wave forecast and the tide at a surf break of the catalogue, and what is known of the break. */
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

  // A break says where it comes from when the instance knows, and on what terms when it has any.
  const source = found.data?.source;
  const attribution = source?.attribution;
  const origin =
    attribution && source?.license
      ? m.source_break({ attribution })
      : attribution
        ? m.source_break_unlicensed({ attribution })
        : attribution;
  const characteristics = found.data && <BreakCharacteristics found={found.data} />;
  const sources = (
    <Sources
      origin={origin}
      license={source?.license}
      forecast={forecast.data}
      tides={tides.data}
    />
  );

  // PROTOTYPE: a variant of the panel, chosen in the address. See prototype/details-prototype.tsx.
  if (variant) {
    return (
      <div className="grid gap-l">
        <DetailsPrototype
          spot={found.data}
          now={now}
          forecast={forecast}
          tides={tides}
          extremes={extremes}
          onTideExtend={onTideExtend}
          guide={characteristics}
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
      {characteristics}
      {sources}
    </div>
  );
}
