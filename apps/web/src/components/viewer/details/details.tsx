import { type SeaWords, tideNowOf, verdictOf, windAtShoreOf } from "@repo/conditions/sea-now";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  lazy,
  memo,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { useSaveDensity } from "@/components/shared/density-account";
import { type Density, useDensity } from "@/lib/density";
import { formatDayAndClock } from "@/lib/format";
import { useStoredState } from "@/lib/use-stored-state";
import { m } from "@/paraglide/messages.js";

import { type PointConditionsProps, TideChart } from "../point-conditions";
import type { Reading, Station } from "../types";
import { SHEET_FOLD } from "../viewer-drawer";
import { DaysAhead } from "./days-ahead";
import { DensitySwitch } from "./density-switch";
import { GRID_ROWS, type GridRow, ForecastGrid } from "./forecast-grid";
import {
  DAY_MS,
  HOUR_MS,
  METRIC_KEYS,
  type MetricKey,
  measuredSamples,
  metrics,
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
  nowOf,
} from "./parts";
import { SeaNow, type SeaNowProps } from "./sea-now";

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
 *
 * And on 2026-10-16, decision 061: one panel that shows less or more, by a density the account
 * keeps. The essentials say the sea in words, the details are the panel as it was without the
 * expert's figures, and everything is the whole of it.
 */

// How far the lanes reach on each side of now, in hours. The week keeps a day of the past and
// goes as far as the model does.
const SPANS = { "12h": 12, "24h": 24, "48h": 48 } as const;
type Range = keyof typeof SPANS | "week";
const RANGES = [...Object.keys(SPANS), "week"] as Range[];

// What each density draws of the tiles, the lanes and the week's table. The essentials draw
// none of them.
const DETAILED_KEYS: MetricKey[] = ["height", "period", "wind"];
const DETAILED_ROWS: GridRow[] = [];

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

type ConditionsProps = DetailsProps & {
  density: Density;
  onDensityChange: (next: Density) => void;
  // What the place says of itself, for the sentence of the sea now to be judged by. None at a
  // buoy, or at a place whose words are not known yet.
  words?: SeaWords | null;
};

/**
 * The sea now as the sentence says it: what the tiles read, a measurement where there is a live
 * one and the model otherwise, the wind named by the shore, the tide from its timeline, and the
 * place's words laid against them.
 */
function seaNowOf(props: DetailsProps, words: SeaWords | null | undefined): SeaNowProps {
  const all = metrics();
  const height = nowOf(all.height, props);
  const period = nowOf(all.period, props);
  const wind = nowOf(all.wind, props);
  const tideNow = tideNowOf(props.tides.data?.timeline ?? [], props.now);
  // The next low and high water, which the stage of the tide is read between.
  const ahead = (props.extremes.data?.extremes ?? []).filter(
    (extreme) => extreme.time.getTime() >= props.now,
  );
  const offshore = { offshoreDirectionDegrees: props.offshoreFrom ?? null };
  const hour = {
    waveHeightMeters: height.shown ?? null,
    waveDirectionDegrees: height.bearing ?? null,
    windDirectionDegrees: wind.bearing ?? null,
  };
  return {
    waves: { height: height.shown, period: period.shown, direction: height.bearing },
    wind: { knots: wind.shown, direction: wind.bearing, atShore: windAtShoreOf(hour, offshore) },
    tide: tideNow && { trend: tideNow.trend, next: ahead[0] },
    verdict: words
      ? verdictOf(words, hour, tideNow ? { now: tideNow, extremes: ahead } : null)
      : null,
    isLoading: props.hasBuoy ? props.historyPending && !props.latest : props.forecast.isPending,
  };
}

/**
 * Four tiles for now. At a buoy, the swell, its period, its energy and the wind as four lanes on
 * one span of time, the buoy drawn over the model. Then the week as a grid, and the tide. Or, at
 * the least density, the sea now in a sentence and the days ahead in words.
 */
/**
 * How the week's table goes back to now while it is scrolled away from it. Only the button reads
 * it: the panel, with its charts, is not drawn again as the button comes and goes.
 */
function wayBack() {
  let go: (() => void) | undefined;
  const listeners = new Set<() => void>();
  return {
    set: (next: (() => void) | undefined) => {
      go = next;
      for (const listener of listeners) listener();
    },
    get: () => go,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Only while the grid is scrolled away from now.
function BackToNow({ way }: { way: ReturnType<typeof wayBack> }) {
  const go = useSyncExternalStore(way.subscribe, way.get, way.get);
  if (!go) return null;
  return (
    <Button variant="secondary" size="xs" onClick={go}>
      {m.details_back_to_now()}
    </Button>
  );
}

const Conditions = memo(function Conditions(props: ConditionsProps) {
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes, density, words } = props;
  const [range, setRange] = useState<Range>("24h");
  // How to bring the grid back to now, while it is scrolled away from it.
  const [backToNow] = useState(wayBack);
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

  const everything = density === "everything";
  const keys = everything ? METRIC_KEYS : DETAILED_KEYS;
  const rows = everything ? GRID_ROWS : DETAILED_ROWS;

  const tide = (
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
  );
  const more = <DensitySwitch density={density} onChange={props.onDensityChange} />;

  if (density === "essentials") {
    return (
      <div className="grid gap-m">
        {/* What a phone's sheet shows before it is raised: the sentence alone. */}
        <div {...SHEET_FOLD}>
          <SeaNow {...seaNowOf(props, words)} />
        </div>
        {forecast.isPending || forecast.data ? (
          <Block title={m.page_week()}>
            <DaysAhead
              hours={forecast.data?.hours}
              now={now}
              offshoreFrom={props.offshoreFrom}
              words={words}
              isLoading={forecast.isPending}
            />
          </Block>
        ) : (
          <p className="text-s text-neutral-7">
            {forecast.isUnavailable ? m.forecast_unavailable() : m.forecast_none()}
          </p>
        )}
        {tide}
        {more}
        {props.footer}
      </div>
    );
  }

  return (
    <div className="grid gap-m">
      {/* What a phone's sheet shows before it is raised. */}
      <div className="grid gap-xs" {...SHEET_FOLD}>
        <NowTiles {...props} keys={keys} withModel={everything} />
        {everything && <ReadingMore latest={props.latest} />}
        {everything && props.nearby && (
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
                keys={keys}
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

          <Block title={m.details_week()} control={<BackToNow way={backToNow} />}>
            <ForecastGrid
              named={named}
              onNamedChange={setNamed}
              onAway={backToNow.set}
              rows={rows}
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

      {tide}
      {more}
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
  // What the break, or the spot, says of itself: the sentence of the sea now is judged by it.
  words?: SeaWords | null;
  // How much of the forecast to show. Without it, the panel reads what the reader chose:
  // decision 061. A sample gives one.
  density?: Density;
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
  words,
  density: asked,
  guide,
  alert,
  sessions,
  tab,
  onTabChange,
  ...conditions
}: DetailsOfProps) {
  const chosen = useDensity();
  const saveDensity = useSaveDensity();
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = conditions.forecast.data?.hours;
  // Beside a buoy, the model's period is of the kind the buoy gives.
  const periodKind = periodKindOf(latest);
  const model = useMemo(() => modelSamples(hours ?? [], periodKind), [hours, periodKind]);
  const point = conditions.forecast.data?.point;

  const props: ConditionsProps = {
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
    words,
    density: asked ?? chosen,
    onDensityChange: saveDensity,
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
