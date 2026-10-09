// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { TideChart } from "../point-conditions";
import { ForecastGrid } from "./forecast-grid";
import { MetricLanes } from "./metric-lanes";
import { HOUR_MS, nightsBetween, t } from "./metrics";
import {
  BiasNote,
  Block,
  type DetailsProps,
  NowTiles,
  ReadingDetails,
  ViewToggle,
  liveSpan,
} from "./parts";

export const VARIANT_A_NAME = "Lanes";

type View = "chart" | "table";

/**
 * Variant A. Four tiles for now, then the four values as four lanes on one span of time, the buoy
 * drawn over the model, and the week ahead as a grid.
 */
export function VariantA(props: DetailsProps) {
  const strings = t();
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes } = props;
  const [liveView, setLiveView] = useState<View>("chart");
  const [rangeView, setRangeView] = useState<View>("table");
  const views = [
    { value: "chart" as const, label: strings.chart },
    { value: "table" as const, label: strings.table },
  ];

  const live = liveSpan(props);
  const weekEnd = model.at(-1)?.time ?? now;
  const liveNights = useMemo(
    () => (place ? nightsBetween(live.start, live.end, place.latitude, place.longitude) : []),
    [place, live.start, live.end],
  );
  const weekNights = useMemo(
    () => (place ? nightsBetween(now, weekEnd, place.latitude, place.longitude) : []),
    // The nights move with the days, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, Math.floor(now / HOUR_MS), weekEnd],
  );
  const allExtremes = extremes.data?.extremes ?? [];

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <NowTiles {...props} />
        <ReadingDetails latest={props.latest} />
        {hasBuoy && <BiasNote {...props} />}
        {hasBuoy && !props.measuresWind && (
          <p className="text-xs text-neutral-7">{strings.noWindSensor}</p>
        )}
      </div>

      {forecast.isPending || forecast.data ? (
        <>
          <Block
            title={hasBuoy ? strings.live : strings.liveBreak}
            note={hasBuoy ? strings.liveNote : undefined}
            control={<ViewToggle value={liveView} options={views} onChange={setLiveView} />}
          >
            {liveView === "chart" ? (
              <MetricLanes
                measured={measured}
                model={model}
                start={live.start}
                end={live.end}
                now={now}
                nights={liveNights}
                isLoading={forecast.isPending}
              />
            ) : (
              <ForecastGrid
                model={model}
                measured={hasBuoy ? measured : undefined}
                start={live.start}
                end={live.end}
                now={now}
                place={place}
                lead={hasBuoy ? 4 : 0}
                isLoading={forecast.isPending}
              />
            )}
            {hasBuoy && <p className="text-xs text-neutral-7">{strings.modelNote}</p>}
          </Block>

          <Block
            title={strings.longRange}
            note={strings.longRangeNote}
            control={<ViewToggle value={rangeView} options={views} onChange={setRangeView} />}
          >
            {rangeView === "table" ? (
              <ForecastGrid
                model={model}
                start={now - 1.5 * HOUR_MS}
                end={weekEnd}
                now={now}
                place={place}
                isLoading={forecast.isPending}
              />
            ) : (
              <MetricLanes
                measured={[]}
                model={model}
                start={now}
                end={weekEnd}
                now={now}
                nights={weekNights}
                laneHeight={44}
                isLoading={forecast.isPending}
              />
            )}
          </Block>
        </>
      ) : (
        <p className="text-s text-neutral-7">{m.forecast_none()}</p>
      )}

      {(tides.isPending || tides.data) && (
        <Block title={m.tide_title()}>
          <TideChart
            label={m.tide_title()}
            now={new Date(now)}
            onExtend={props.onTideExtend}
            isLoading={tides.isPending}
            extremes={allExtremes}
            points={(tides.data?.timeline ?? []).map((entry) => ({
              time: entry.time,
              value: entry.heightMeters,
            }))}
          />
        </Block>
      )}

      {props.footer}
    </div>
  );
}
