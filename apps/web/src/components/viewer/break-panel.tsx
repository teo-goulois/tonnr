import { type ReactNode, useState } from "react";

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
  // Whether the guide is the tab in view, which the address says, and what changes it.
  guideAsked: boolean;
  onGuideAsked: (asked: boolean) => void;
  // The buoy the sea is read on at this break, and how to open its panel over this one.
  nearby?: Nearby;
  nearbyWind?: NearbyWind;
  onOpenBuoy?: (stationId: string) => void;
  // The sessions the reader surfed there, for the tab beside the guide: decision 043.
  sessions?: ReactNode;
};

/** The week and the tide at a surf break of the catalogue, and what is written of the break. */
export function BreakPanel({
  now,
  found,
  guide,
  own,
  guiding,
  guideAsked,
  onGuideAsked,
  forecast,
  tides,
  extremes,
  onTideExtend,
  nearby,
  nearbyWind,
  onOpenBuoy,
  sessions,
}: BreakPanelProps) {
  // The address says whether the guide is in view. The sessions are a tab the panel keeps to
  // itself: nothing leads to it from elsewhere.
  const [isLog, setIsLog] = useState(false);
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
      tab={isLog ? "sessions" : guideAsked ? "guide" : "forecast"}
      onTabChange={(next: DetailsTab) => {
        setIsLog(next === "sessions");
        onGuideAsked(next === "guide");
      }}
      sessions={sessions}
      now={now}
      forecast={forecast}
      tides={tides}
      extremes={extremes}
      onTideExtend={onTideExtend}
      nearby={nearby}
      nearbyWind={nearbyWind}
      offshoreFrom={found.data?.characteristics.offshoreDirectionDegrees}
      words={found.data?.characteristics}
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
