import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  lazy,
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";

import { formatDayAndClock } from "@/lib/format";
import { useStoredState } from "@/lib/use-stored-state";
import { m } from "@/paraglide/messages.js";

import { type PointConditionsProps, TideChart } from "../point-conditions";
import type { Reading, Station } from "../types";
import { SHEET_FOLD } from "../viewer-drawer";
import { ForecastGrid } from "./forecast-grid";
import {
  DAY_MS,
  HOUR_MS,
  measuredSamples,
  modelSamples,
  nightsBetween,
  periodKindOf,
} from "./metrics";
import {
  About,
  Block,
  type DetailsProps,
  type Nearby,
  NearbyBuoy,
  type NearbyWind,
  NearbyWindStation,
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
 *
 * And on 2026-10-13:
 * - The lanes reach 12, 24 or 48 hours on each side of now, or the week, and open on 24.
 * - The lanes write their figures in the same columns. Their legend is behind the button that
 *   explains, and the moment under the pointer is written over its line.
 * - What a reader learns once is not said again: how a finger reads the curves, until it has, and
 *   the names of the grid's rows, which an arrow over them folds to their first letter.
 */

// How far the lanes reach on each side of now, in hours. The week keeps a day of the past and
// goes as far as the model does.
const SPANS = { "12h": 12, "24h": 24, "48h": 48 } as const;
type Range = keyof typeof SPANS | "week";
const RANGES = [...Object.keys(SPANS), "week"] as Range[];

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
const Conditions = memo(function Conditions(props: DetailsProps) {
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes } = props;
  const [range, setRange] = useState<Range>("24h");
  // How to bring the grid back to now, while it is scrolled away from it.
  const [backToNow, setBackToNow] = useState<{ go: () => void }>();
  const onGridAway = useCallback((go: (() => void) | undefined) => setBackToNow(go && { go }), []);
  // The names of the grid's rows, which a reader who knows them folds to a letter: kept in the
  // browser.
  const [named, setNamed] = useStoredState("tonnr:grid-names", true, (stored) =>
    typeof stored === "boolean" ? stored : null,
  );

  const first = model[0]?.time ?? now;
  const last = model.at(-1)?.time ?? now;
  // The week's table opens on now, or on two days before it beside a buoy, and a pull past its
  // start shows one day more of what the model holds before, from its midnight.
  const [daysBack, setDaysBack] = useState(0);
  const gridOpens = hasBuoy ? now - 2 * DAY_MS : now - 1.5 * HOUR_MS;
  const midnight = new Date(gridOpens);
  midnight.setHours(0, 0, 0, 0);
  const gridStart = Math.max(
    first,
    daysBack === 0 ? gridOpens : midnight.getTime() - daysBack * DAY_MS,
  );
  // Around a buoy, as much of the past as of the days ahead. Elsewhere, the days ahead alone.
  const span = range === "week" ? undefined : SPANS[range] * HOUR_MS;
  const back = hasBuoy ? (span ?? DAY_MS) : 3 * HOUR_MS;
  const start = Math.max(first, now - back);
  const end = span === undefined ? last : Math.min(last, now + span);
  const nights = useMemo(
    () => (place ? nightsBetween(start, end, place.latitude, place.longitude) : []),
    // The nights move with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, Math.floor(start / HOUR_MS), end],
  );

  return (
    <div className="grid gap-m">
      {/* What a phone's sheet shows before it is raised. */}
      <div className="grid gap-xs" {...SHEET_FOLD}>
        <NowTiles {...props} />
        <ReadingMore latest={props.latest} />
        {props.nearby && (
          <NearbyBuoy nearby={props.nearby} now={now} onOpen={props.onOpenStation} />
        )}
        {props.nearbyWind && (
          <NearbyWindStation
            nearby={props.nearbyWind}
            now={now}
            offshoreFrom={props.offshoreFrom}
            onOpen={props.onOpenStation}
          />
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
                      {RANGES.map((one) => (
                        <TabsTab key={one} value={one} className="max-lg:px-xs!">
                          {one === "week"
                            ? `7 ${m.details_days_short()}`
                            : `${SPANS[one]} ${m.details_hours_short()}`}
                        </TabsTab>
                      ))}
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

          <Block
            title={m.details_week()}
            control={
              // Only while the grid is scrolled away from now.
              backToNow && (
                <Button variant="secondary" size="xs" onClick={backToNow.go}>
                  {m.details_back_to_now()}
                </Button>
              )
            }
          >
            <ForecastGrid
              named={named}
              onNamedChange={setNamed}
              onAway={onGridAway}
              model={model}
              measured={hasBuoy ? measured : undefined}
              start={gridStart}
              onEarlier={
                gridStart > first + HOUR_MS ? () => setDaysBack((days) => days + 1) : undefined
              }
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
});

export type DetailsTab = "forecast" | "guide" | "alert" | "sessions";

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
  // The alert of a spot of the user's own, for a third tab. A break has none.
  alert?: ReactNode;
  // The sessions the account surfed there, for the last tab: decision 043.
  sessions?: ReactNode;
  // The tab in view, for a panel that opens one itself. Without it the panel opens on the
  // forecast and keeps its own count.
  tab?: DetailsTab;
  onTabChange?: (tab: DetailsTab) => void;
  // At a surf break: the buoy to read the sea on, and how to open it.
  nearby?: Nearby;
  // At a surf break: the station the wind is read on, and where the wind comes from when it
  // blows off the shore there.
  nearbyWind?: NearbyWind;
  offshoreFrom?: number | null;
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
  alert,
  sessions,
  tab,
  onTabChange,
  ...conditions
}: DetailsOfProps) {
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = conditions.forecast.data?.hours;
  // Beside a buoy, the model's period is of the kind the buoy gives.
  const periodKind = periodKindOf(latest);
  const model = useMemo(() => modelSamples(hours ?? [], periodKind), [hours, periodKind]);
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
    <Tabs
      {...(tab === undefined
        ? { defaultValue: "forecast" }
        : { value: tab, onValueChange: (next) => onTabChange?.(next as DetailsTab) })}
      className="gap-m"
    >
      <TabsList>
        <TabsTab value="forecast">{m.details_forecast_tab()}</TabsTab>
        <TabsTab value="guide">{m.details_guide_tab()}</TabsTab>
        {alert && <TabsTab value="alert">{m.details_alert_tab()}</TabsTab>}
        {sessions && <TabsTab value="sessions">{m.details_sessions_tab()}</TabsTab>}
      </TabsList>
      <TabsPanel value="forecast">
        <Conditions {...props} />
      </TabsPanel>
      {/* Kept while the forecast is in view: what a panel lets its reader write there is not lost
          to a look at the other tab. */}
      <TabsPanel value="guide" keepMounted>
        {/* What draws the guide draws nothing for a break of which only the place is known. */}
        <div className="peer">{guide}</div>
        <p className="hidden text-s text-neutral-7 peer-empty:block">{m.details_guide_empty()}</p>
      </TabsPanel>
      {/* Kept as the guide is: an alert that is being written is not lost to another tab. */}
      {alert && (
        <TabsPanel value="alert" keepMounted>
          {alert}
        </TabsPanel>
      )}
      {sessions && <TabsPanel value="sessions">{sessions}</TabsPanel>}
    </Tabs>
  );
}
