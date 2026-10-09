// PROTOTYPE: thrown away once the new details panel is settled. See details-prototype.tsx.

import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { TideChart } from "../point-conditions";
import { ForecastGrid } from "./forecast-grid";
import { MetricLanes } from "./metric-lanes";
import { DAY_MS, HOUR_MS, nightsBetween, t } from "./metrics";
import { About, Block, type DetailsProps, NearbyBuoy, NowTiles, ReadingMore } from "./parts";

type Range = "live" | "week";

/**
 * The panel of a buoy or of a surf break. Four tiles for now, then the swell, its period, its
 * energy and the wind as four lanes on one span of time, the buoy drawn over the model, then the
 * week as a grid, and the tide.
 */
export function VariantA(props: DetailsProps) {
  const strings = t();
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes } = props;
  const [range, setRange] = useState<Range>("live");

  const first = model[0]?.time ?? now;
  const last = model.at(-1)?.time ?? now;
  // Around a buoy, as much of the past as of the days ahead. Elsewhere, the days ahead alone.
  const back = hasBuoy ? (range === "live" ? 2 * DAY_MS : DAY_MS) : 3 * HOUR_MS;
  const start = Math.max(first, now - back);
  const end = range === "live" ? Math.min(last, now + 2 * DAY_MS) : last;
  const nights = useMemo(
    () => (place ? nightsBetween(start, end, place.latitude, place.longitude) : []),
    // The nights move with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, Math.floor(start / HOUR_MS), end],
  );

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <NowTiles {...props} />
        <ReadingMore latest={props.latest} />
        {props.nearby && (
          <NearbyBuoy nearby={props.nearby} now={now} onOpen={props.onOpenStation} />
        )}
      </div>

      {forecast.isPending || forecast.data ? (
        <>
          <Block
            title={hasBuoy ? strings.live : strings.ahead}
            control={
              <>
                {hasBuoy && <About {...props} />}
                <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
                  <TabsList variant="segment">
                    <TabsTab value="live">48 h</TabsTab>
                    <TabsTab value="week">7 {strings.days}</TabsTab>
                  </TabsList>
                </Tabs>
              </>
            }
          >
            <MetricLanes
              measured={measured}
              model={model}
              start={start}
              end={end}
              now={now}
              nights={nights}
              isLoading={forecast.isPending}
            />
          </Block>

          <Block title={strings.week}>
            <ForecastGrid
              model={model}
              measured={hasBuoy ? measured : undefined}
              start={hasBuoy ? Math.max(first, now - 2 * DAY_MS) : now - 1.5 * HOUR_MS}
              end={last}
              now={now}
              place={place}
              lead={hasBuoy ? 3 : 0}
              isLoading={forecast.isPending}
            />
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
            extremes={extremes.data?.extremes ?? []}
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
