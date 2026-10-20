import type {
  Forecast,
  Loadable,
  Reading,
  Station,
  TideExtremes,
  TideTimeline,
} from "@repo/client/viewer/types";
import type { SeaWords } from "@repo/conditions/sea-now";
import { type ReactNode, memo, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";

import { type Density, useDensity } from "@/components/account/display";
import { useSaveDensity } from "@/components/account/kept-settings";
import { MetricLanes } from "@/components/charts/metric-lanes";
import { TideChart } from "@/components/charts/tide-chart";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Text } from "@/components/ui/text";
import { formatDayAndClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Block } from "./block";
import { DaysAhead } from "./days-ahead";
import { DensitySwitch } from "./density-switch";
import { ForecastGrid, GRID_ROWS, type GridRow } from "./forecast-grid";
import {
  DAY_MS,
  HOUR_MS,
  METRIC_KEYS,
  type MetricKey,
  measuredSamples,
  modelSamples,
  nightsBetween,
  periodKindOf,
} from "./metrics";
import type { Nearby } from "./nearby";
import { NearbyBuoy, NearbyWindStation } from "./nearby-rows";
import { type SeaRead, seaNowOf } from "./now";
import { About, NowTiles, ReadingMore } from "./now-tiles";
import { SeaNow } from "./sea-now";

// The forecast of a buoy, a surf break or a spot, in the sheet of a place: the web's `Details`
// (`apps/web/src/components/viewer/details/details.tsx`), one tree of parts drawn by the density
// the account chose (decision 061). The essentials say the sea in words, the details are the
// panel without the expert's figures, and everything is the whole of it. What a phone's sheet
// shows before it is raised is told to the sheet by `onFold`, as the web marks it `SHEET_FOLD`.

// How far the lanes reach on each side of now, in hours. The week keeps a day of the past.
const SPANS = { "12h": 12, "24h": 24, "48h": 48 } as const;
type Range = keyof typeof SPANS | "week";

// What the details draw of the tiles, the lanes and the week's table.
const DETAILED_KEYS: MetricKey[] = ["height", "period", "wind"];
const DETAILED_ROWS: GridRow[] = [];

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

function BackToNow({ way }: { way: ReturnType<typeof wayBack> }) {
  const go = useSyncExternalStore(way.subscribe, way.get, way.get);
  if (!go) return null;
  return (
    <Button variant="secondary" onPress={go}>
      {m.details_back_to_now()}
    </Button>
  );
}

export type ForecastPanelProps = {
  now: number;
  forecast: Loadable<Forecast>;
  tides: Loadable<TideTimeline>;
  extremes: Loadable<TideExtremes>;
  // Asks for one more day of tide, before the days loaded or after them.
  onTideExtend?: (direction: -1 | 1) => void;
  // The buoy the panel is of. Undefined at a surf break or a spot.
  station?: Pick<Station, "latitude" | "longitude" | "measures">;
  // Its readings, newest first.
  readings?: Reading[];
  latest?: Reading | null;
  historyPending?: boolean;
  // The surf break or the spot the panel is of. Undefined at a buoy.
  spot?: { latitude: number; longitude: number };
  // What the place says of itself, for the sentence of the sea now to be judged by.
  words?: SeaWords | null;
  offshoreFrom?: number | null;
  // At a surf break or a spot: the buoy and the station the sea and the wind are read on.
  nearby?: Nearby;
  nearbyWind?: Nearby;
  onOpenStation?: (stationId: string) => void;
  // How big the waves of a break run against the forecast, or nothing: decision 062.
  sizeAgainst?: ReactNode;
  // What credits the data.
  footer: ReactNode;
  // Where what a phone's sheet shows before it is raised ends, from the top of the panel.
  onFold?: (bottom: number) => void;
  // How much to show. Without it, the panel reads what the reader chose.
  density?: Density;
};

type ConditionsProps = Omit<ForecastPanelProps, "readings" | "density"> &
  SeaRead & {
    density: Density;
    onDensityChange: (next: Density) => void;
    place?: { latitude: number; longitude: number };
    hasBuoy: boolean;
    measuresWind: boolean;
  };

const Conditions = memo(function Conditions(props: ConditionsProps) {
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes, density, words } = props;
  const { space } = useTheme();
  const [range, setRange] = useState<Range>("24h");
  const [backToNow] = useState(wayBack);

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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [place, Math.floor(start / HOUR_MS), end],
  );
  const facts = useMemo(
    () =>
      seaNowOf(
        { measured, model, now },
        {
          offshoreFrom: props.offshoreFrom,
          words,
          tides: tides.data,
          extremes: extremes.data,
        },
      ),
    [measured, model, now, props.offshoreFrom, words, tides.data, extremes.data],
  );
  const isNowLoading = hasBuoy
    ? (props.historyPending ?? false) && !props.latest
    : forecast.isPending;

  const everything = density === "everything";
  const keys = everything ? METRIC_KEYS : DETAILED_KEYS;
  const rows = everything ? GRID_ROWS : DETAILED_ROWS;
  const fold = (event: { nativeEvent: { layout: { y: number; height: number } } }) =>
    props.onFold?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height);

  const tide = (
    <Block title={m.tide_title()}>
      {tides.isPending || tides.data ? (
        <TideChart
          label={m.tide_title()}
          now={now}
          onExtend={props.onTideExtend}
          isLoading={tides.isPending}
          extremes={extremes.data?.extremes ?? []}
          timeline={tides.data?.timeline ?? []}
        />
      ) : (
        <Text size="s" tone="muted">
          {tides.isUnavailable ? m.tide_unavailable() : m.tide_none()}
        </Text>
      )}
    </Block>
  );
  const none = (
    <Text size="s" tone="muted">
      {forecast.isUnavailable ? m.forecast_unavailable() : m.forecast_none()}
    </Text>
  );
  const more = <DensitySwitch density={density} onChange={props.onDensityChange} />;

  if (density === "essentials") {
    return (
      <View style={{ gap: space.m }}>
        {/* What a phone's sheet shows before it is raised: the sentence alone. */}
        <View onLayout={fold}>
          <SeaNow facts={facts} isLoading={isNowLoading} />
        </View>
        {/* Drawn at every density: the one place the faces are set against the model. */}
        {props.sizeAgainst}
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
          none
        )}
        {tide}
        {more}
        {props.footer}
      </View>
    );
  }

  return (
    <View style={{ gap: space.m }}>
      {/* What a phone's sheet shows before it is raised. */}
      <View style={{ gap: space.xs }} onLayout={fold}>
        <NowTiles
          measured={measured}
          model={model}
          now={now}
          keys={keys}
          withModel={everything}
          hasBuoy={hasBuoy}
          isLoading={isNowLoading}
        />
        {everything && <ReadingMore latest={props.latest} />}
        {everything && props.nearby && props.onOpenStation && (
          <NearbyBuoy nearby={props.nearby} now={now} onOpen={props.onOpenStation} />
        )}
        {props.nearbyWind && props.onOpenStation && (
          <NearbyWindStation
            nearby={props.nearbyWind}
            now={now}
            offshoreFrom={props.offshoreFrom}
            onOpen={props.onOpenStation}
          />
        )}
        {props.sizeAgainst}
      </View>

      {forecast.isPending || forecast.data ? (
        <>
          {/* A forecast the instance could not renew says so, with when it was fetched. */}
          {forecast.data?.stale && (
            <Text size="xs" tone="muted">
              {m.forecast_older({ time: formatDayAndClock(forecast.data.fetchedAt) })}
            </Text>
          )}

          {/* A surf break has no buoy to set against the model: its week is read in the table. */}
          {hasBuoy && (
            <Block
              title={m.details_buoy_and_model()}
              control={
                <About
                  measured={measured}
                  model={model}
                  now={now}
                  measuresWind={props.measuresWind}
                />
              }
            >
              <Segmented
                label={m.details_buoy_and_model()}
                fill
                options={[
                  ...(Object.keys(SPANS) as (keyof typeof SPANS)[]).map((one) => ({
                    value: one,
                    label: `${SPANS[one]} ${m.details_hours_short()}`,
                  })),
                  { value: "week" as const, label: `7 ${m.details_days_short()}` },
                ]}
                value={range}
                onChange={setRange}
              />
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
        none
      )}

      {tide}
      {more}
      {props.footer}
    </View>
  );
});

/** The forecast of a place, put on one footing for the parts that draw it. */
export function ForecastPanel({ readings, density: asked, ...props }: ForecastPanelProps) {
  const chosen = useDensity();
  const saveDensity = useSaveDensity();
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = props.forecast.data?.hours;
  // Beside a buoy, the model's period is of the kind the buoy gives.
  const periodKind = periodKindOf(props.latest);
  const model = useMemo(() => modelSamples(hours ?? [], periodKind), [hours, periodKind]);
  const point = props.forecast.data?.point;
  const { station, spot } = props;
  const place = useMemo(
    () =>
      station
        ? { latitude: station.latitude, longitude: station.longitude }
        : (spot ?? (point && { latitude: point.latitude, longitude: point.longitude })),
    [station, spot, point],
  );

  return (
    <Conditions
      {...props}
      measured={measured}
      model={model}
      place={place}
      // A station that reports the wind alone is read as a buoy too: its lanes of waves stay
      // empty. Its own panel is `WindDetails`.
      hasBuoy={station !== undefined || (props.historyPending ?? false)}
      measuresWind={station?.measures.includes("wind") ?? false}
      density={asked ?? chosen}
      onDensityChange={saveDensity}
    />
  );
}
