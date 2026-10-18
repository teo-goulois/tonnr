import { type ReactNode, useEffect, useRef, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { BreakGuide } from "../guides/break-guide";
import type { Guiding } from "../guides/types";
import { Details, type DetailsTab } from "./details/details";
import type { Nearby, NearbyWind } from "./details/parts";
import { type PointConditionsProps, Sources } from "./point-conditions";
import { SizeAgainstForecast } from "./size-against-forecast";
import type { Guide, GuideOwn, Loadable, SizeFactor, SurfBreak } from "./types";

type BreakPanelProps = PointConditionsProps & {
  found: Loadable<SurfBreak>;
  // How big its waves run against the forecast, from the sessions surfed there, once they
  // say: decision 062. Undefined while it is on its way, or when the break is not found.
  sizeFactor?: SizeFactor;
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
  // The reader's alerts at the break, for a tab of their own, and how many times they were asked
  // for from elsewhere: the tab then comes in view. Decision 064.
  alerts?: ReactNode;
  alertAsked?: number;
  // What accounts showed of the waves there lately, for the tab after the forecast: decision 067.
  reports?: ReactNode;
};

/** The week and the tide at a surf break of the catalogue, and what is written of the break. */
export function BreakPanel({
  now,
  found,
  sizeFactor,
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
  alerts,
  alertAsked = 0,
  reports,
}: BreakPanelProps) {
  // The address says whether the guide is in view. The alerts, the sessions and the reports are
  // tabs the panel keeps to itself: only an alert asked for from elsewhere leads to one.
  const [kept, setKept] = useState<"alert" | "sessions" | "reports" | null>(
    alertAsked > 0 ? "alert" : null,
  );
  const asked = useRef(alertAsked);
  useEffect(() => {
    if (alertAsked === asked.current) return;
    asked.current = alertAsked;
    setKept("alert");
  }, [alertAsked]);
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
      tab={kept ?? (guideAsked ? "guide" : "forecast")}
      onTabChange={(next: DetailsTab) => {
        setKept(next === "sessions" || next === "alert" || next === "reports" ? next : null);
        onGuideAsked(next === "guide");
      }}
      alert={alerts}
      sessions={sessions}
      reports={reports}
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
      sizeAgainst={
        <SizeAgainstForecast
          learned={sizeFactor}
          locals={found.data?.characteristics.sizeFactors}
          hours={forecast.data?.hours}
          now={now}
        />
      }
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
