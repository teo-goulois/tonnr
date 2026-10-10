import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import { type ComponentProps, type ReactNode, Suspense, lazy, useMemo, useState } from "react";

import { formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { type PointConditionsProps, TideChart } from "../point-conditions";
import type { Reading, Station } from "../types";
import { ForecastGrid } from "./forecast-grid";
import { DAY_MS, HOUR_MS, measuredSamples, modelSamples, nightsBetween } from "./metrics";
import {
  About,
  Block,
  type DetailsProps,
  type Nearby,
  NearbyBuoy,
  NowTiles,
  ReadingMore,
} from "./parts";

/*
 * The panel of a buoy or of a surf break: the swell, its period, its energy and the wind read
 * together, the buoy beside the model, with the week ahead as a table.
 *
 * Settled with Téo on 2026-10-09:
 * - Four lanes on one span of time, one under the other, the buoy over the model.
 * - Every table is the grid that scrolls sideways, a column for each hour.
 * - The energy is in kilojoules.
 * - As little text as the panel can do with. What explains is behind a button.
 */

type Range = "live" | "week";

// The lanes draw with the chart library, which is heavy: they load apart from the map, as the
// other charts do. The viewer asks for them as soon as the map is up.
const LazyMetricLanes = lazy(() =>
  import("./metric-lanes").then((module) => ({ default: module.MetricLanes })),
);

function MetricLanes(props: ComponentProps<typeof LazyMetricLanes>) {
  return (
    <Suspense fallback={<Skeleton className="h-[30rem] w-full rounded-(--radius-xs)" />}>
      <LazyMetricLanes {...props} />
    </Suspense>
  );
}

/**
 * Four tiles for now. At a buoy, the swell, its period, its energy and the wind as four lanes on
 * one span of time, the buoy drawn over the model. Then the week as a grid, and the tide.
 */
function Conditions(props: DetailsProps) {
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
          {/* A forecast the instance could not renew says so, with when it was fetched. */}
          {forecast.data?.stale && (
            <p className="text-xs text-neutral-7">
              {m.forecast_older({ time: formatDayAndClock(forecast.data.fetchedAt) })}
            </p>
          )}

          {/* A surf break has no buoy to set against the model: its week is read in the grid. */}
          {hasBuoy && (
            <Block
              title={m.details_buoy_and_model()}
              control={
                <>
                  <About {...props} />
                  <Tabs value={range} onValueChange={(value) => setRange(value as Range)}>
                    <TabsList variant="segment">
                      <TabsTab value="live">48 h</TabsTab>
                      <TabsTab value="week">7 {m.details_days_short()}</TabsTab>
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
          )}

          <Block title={m.details_week()}>
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
        <p className="text-s text-neutral-7">
          {forecast.isUnavailable ? m.forecast_unavailable() : m.forecast_none()}
        </p>
      )}

      <Block title={m.tide_title()}>
        {tides.isPending || tides.data ? (
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
        ) : (
          <p className="text-s text-neutral-7">
            {tides.isUnavailable ? m.tide_unavailable() : m.tide_none()}
          </p>
        )}
      </Block>

      {props.footer}
    </div>
  );
}

type DetailsOfProps = PointConditionsProps & {
  // The buoy the panel is of. Undefined at a surf break.
  station?: Pick<Station, "latitude" | "longitude" | "measures">;
  readings?: Reading[];
  latest?: Reading | null;
  historyPending?: boolean;
  // The surf break the panel is of. Undefined at a buoy.
  spot?: { latitude: number; longitude: number };
  // What is known of the surf break, for the tab beside its forecast.
  guide?: ReactNode;
  // At a surf break: the buoy to read the sea on, and how to open it.
  nearby?: Nearby;
  onOpenStation?: (stationId: string) => void;
  // What credits the data.
  footer: ReactNode;
};

/** What a buoy or a surf break is given to show, put on one footing for the panel. */
export function Details({
  station,
  readings,
  latest,
  historyPending = false,
  spot,
  guide,
  ...conditions
}: DetailsOfProps) {
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = conditions.forecast.data?.hours;
  const model = useMemo(() => modelSamples(hours ?? []), [hours]);
  const point = conditions.forecast.data?.point;

  const props: DetailsProps = {
    ...conditions,
    station,
    latest,
    measured,
    model,
    place: station
      ? { latitude: station.latitude, longitude: station.longitude }
      : (spot ?? (point && { latitude: point.latitude, longitude: point.longitude })),
    // A station that reports the wind alone is read as a buoy too: its lanes of waves stay empty.
    hasBuoy: station !== undefined || historyPending,
    measuresWind: station?.measures.includes("wind") ?? false,
    historyPending,
  };

  if (!spot) return <Conditions {...props} />;

  // A spot holds more than its forecast: each part gets a tab.
  return (
    <Tabs defaultValue="forecast" className="gap-m">
      <TabsList>
        <TabsTab value="forecast">{m.details_forecast_tab()}</TabsTab>
        <TabsTab value="guide">{m.details_guide_tab()}</TabsTab>
      </TabsList>
      <TabsPanel value="forecast">
        <Conditions {...props} />
      </TabsPanel>
      <TabsPanel value="guide">
        {/* What draws the guide draws nothing for a break of which only the place is known. */}
        <div className="peer">{guide}</div>
        <p className="hidden text-s text-neutral-7 peer-empty:block">{m.details_guide_empty()}</p>
      </TabsPanel>
    </Tabs>
  );
}
