import { m } from "@/paraglide/messages.js";

import { BreakCharacteristics } from "./break-characteristics";
import { Details } from "./details/details";
import type { Nearby } from "./details/parts";
import { type PointConditionsProps, Sources } from "./point-conditions";
import type { Loadable, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
  // The buoy the sea is read on at this break, and how to open its panel over this one.
  nearby?: Nearby;
  onOpenBuoy?: (stationId: string) => void;
};

/** The week and the tide at a surf break of the catalogue, and what is known of the break. */
export function BreakPanel({
  now,
  found,
  forecast,
  tides,
  extremes,
  onTideExtend,
  nearby,
  onOpenBuoy,
}: BreakPanelProps) {
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

  return (
    <Details
      spot={found.data}
      now={now}
      forecast={forecast}
      tides={tides}
      extremes={extremes}
      onTideExtend={onTideExtend}
      nearby={nearby}
      onOpenStation={onOpenBuoy}
      guide={found.data && <BreakCharacteristics found={found.data} />}
      footer={
        <Sources
          origin={origin}
          license={source?.license}
          forecast={forecast.data}
          tides={tides.data}
        />
      }
    />
  );
}
