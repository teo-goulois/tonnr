import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import { BreakGuide } from "../guides/break-guide";
import type { Guiding } from "../guides/types";
import { Details, type DetailsTab } from "./details/details";
import type { Nearby, NearbyWind } from "./details/parts";
import { type PointConditionsProps, Sources } from "./point-conditions";
import type { Guide, GuideOwn, Loadable, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
  // What is written of the break, what the reader wrote of it, and what the guide does for
  // them: decision 041.
  guide: Loadable<Guide>;
  own: GuideOwn | undefined;
  guiding: Guiding;
  // True when the panel opens on the guide, as it does from a contribution to it.
  opensOnGuide?: boolean;
  // The buoy the sea is read on at this break, and how to open its panel over this one.
  nearby?: Nearby;
  nearbyWind?: NearbyWind;
  onOpenBuoy?: (stationId: string) => void;
};

/** The week and the tide at a surf break of the catalogue, and what is written of the break. */
export function BreakPanel({
  now,
  found,
  guide,
  own,
  guiding,
  opensOnGuide = false,
  forecast,
  tides,
  extremes,
  onTideExtend,
  nearby,
  nearbyWind,
  onOpenBuoy,
}: BreakPanelProps) {
  const [tab, setTab] = useState<DetailsTab>(opensOnGuide ? "guide" : "forecast");
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
      tab={tab}
      onTabChange={setTab}
      now={now}
      forecast={forecast}
      tides={tides}
      extremes={extremes}
      onTideExtend={onTideExtend}
      nearby={nearby}
      nearbyWind={nearbyWind}
      offshoreFrom={found.data?.characteristics.offshoreDirectionDegrees}
      onOpenStation={onOpenBuoy}
      guide={
        found.data && <BreakGuide found={found.data} guide={guide} own={own} guiding={guiding} />
      }
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
