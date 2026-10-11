import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@repo/ui/components/ui/tabs";
import { type ComponentProps, type ReactNode, Suspense, lazy, useMemo, useState } from "react";

import { compassPoint, formatDayAndClock, formatKnots, formatNumber, toKnots } from "@/lib/format";
import { WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow } from "../map-markers";
import type { Reading, Station } from "../types";
import { HOUR_MS, measuredSamples, nightsBetween } from "./metrics";
import { Block } from "./parts";
import { WIND_RANGES, type WindRangeKey, windRows, windSummary } from "./wind";

// The chart draws with the chart library, which is heavy: it loads apart from the map, as the
// other charts do.
const LazyWindChart = lazy(() =>
  import("./wind-chart").then((module) => ({ default: module.WindChart })),
);

function WindChart(props: ComponentProps<typeof LazyWindChart>) {
  return (
    <Suspense fallback={<Skeleton className="h-[16rem] w-full rounded-(--radius-xs)" />}>
      <LazyWindChart {...props} />
    </Suspense>
  );
}

/** One figure of the wind now, on its tile. */
function Tile({
  label,
  aside,
  figure,
  unit,
  color,
  isLoading,
}: {
  label: string;
  // What stands at the end of the label's line: the wind's arrow, or a bearing in degrees.
  aside?: ReactNode;
  figure: string | undefined;
  unit?: string;
  // The color of the figure on the wind's scale. A tile without one draws no bar.
  color?: string;
  isLoading: boolean;
}) {
  return (
    <div className="grid content-start gap-xxs rounded-(--radius-xs) bg-neutral-2 px-xs py-xs">
      <div className="flex items-center justify-between gap-xxs text-xs text-neutral-7">
        <span className="truncate">{label}</span>
        {!isLoading && aside}
      </div>
      {isLoading ? (
        <Skeleton className="h-(--line-l) w-10 rounded-(--radius-xs)" />
      ) : (
        <div className="truncate text-l font-medium tabular-nums">
          {figure ?? "–"}
          {figure !== undefined && unit && (
            <span className="ml-0.5 text-xs font-normal text-neutral-7">{unit}</span>
          )}
        </div>
      )}
      {color !== undefined && (
        <span
          aria-hidden
          className="h-1 w-6 rounded-full"
          style={{ background: isLoading ? "var(--neutral-4)" : color }}
        />
      )}
    </div>
  );
}

type WindDetailsProps = {
  now: number;
  station?: Pick<Station, "latitude" | "longitude">;
  // The station's readings, newest first.
  readings?: Reading[];
  latest?: Reading | null;
  historyPending: boolean;
  // How many days of readings the panel was given. It asks for a week when a week is chosen.
  historyDays: number;
  onHistoryExtend?: () => void;
  // What credits the data.
  footer: ReactNode;
};

/**
 * The panel of a station that measures the wind alone: what it reads now, then its wind and its
 * gusts over the last hours or days. Nothing of the sea is written there, and no forecast: such
 * a station says what the wind does where it stands.
 *
 * Asked for by Téo on 2026-10-11.
 */
export function WindDetails({
  now,
  station,
  readings,
  latest,
  historyPending,
  historyDays,
  onHistoryExtend,
  footer,
}: WindDetailsProps) {
  const [key, setKey] = useState<WindRangeKey>("days");
  const range = WIND_RANGES[key];
  const end = now;
  const start = end - range.span;

  const samples = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const rows = useMemo(
    () => windRows(samples, start, end, range.step),
    [samples, start, end, range.step],
  );
  const summary = useMemo(() => windSummary(rows), [rows]);
  const nights = useMemo(
    () => (station ? nightsBetween(start, end, station.latitude, station.longitude) : []),
    // The nights move with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [station?.latitude, station?.longitude, Math.floor(start / HOUR_MS), range.span],
  );

  const wind = toKnots(latest?.windSpeedMetersPerSecond);
  const gust = toKnots(latest?.windGustMetersPerSecond);
  const bearing = latest?.windDirectionDegrees;
  const isReading = historyPending && !latest;
  // A span longer than the days in hand waits for them.
  const isChartLoading = (historyPending && !readings) || range.days > historyDays;

  return (
    <div className="grid gap-l">
      <div className="grid grid-cols-3 gap-xs">
        <Tile
          label={m.details_wind()}
          aside={
            bearing != null && (
              <DirectionArrow fromDegrees={bearing} className="size-3 text-neutral-10" />
            )
          }
          figure={wind === null ? undefined : formatNumber(wind, 0)}
          unit={m.unit_kn()}
          color={wind === null ? "var(--neutral-4)" : scaleColor(WIND_SPEED_SCALE, wind)}
          isLoading={isReading}
        />
        <Tile
          label={m.details_gusts()}
          figure={gust === null ? undefined : formatNumber(gust, 0)}
          unit={m.unit_kn()}
          color={gust === null ? "var(--neutral-4)" : scaleColor(WIND_SPEED_SCALE, gust)}
          isLoading={isReading}
        />
        <Tile
          label={m.details_direction()}
          aside={
            bearing != null && <span className="tabular-nums">{formatNumber(bearing, 0)}°</span>
          }
          figure={bearing == null ? undefined : compassPoint(bearing)}
          isLoading={isReading}
        />
      </div>

      <Block
        title={m.details_measurements()}
        control={
          <Tabs
            value={key}
            onValueChange={(value) => {
              const next = value as WindRangeKey;
              setKey(next);
              if (WIND_RANGES[next].days > historyDays) onHistoryExtend?.();
            }}
          >
            <TabsList variant="segment">
              <TabsTab value="hours">6 h</TabsTab>
              <TabsTab value="days">48 h</TabsTab>
              <TabsTab value="week">7 {m.details_days_short()}</TabsTab>
            </TabsList>
          </Tabs>
        }
      >
        <WindChart rows={rows} start={start} end={end} nights={nights} isLoading={isChartLoading} />
        {!isChartLoading && summary.mean !== undefined && (
          <dl className="grid gap-y-xxs text-xs tabular-nums">
            <div className="flex items-baseline justify-between gap-xs">
              <dt className="truncate text-neutral-7">{m.details_wind_mean()}</dt>
              <dd className="whitespace-nowrap">{formatKnots(summary.mean)}</dd>
            </div>
            {summary.strongest && (
              <div className="flex items-baseline justify-between gap-xs">
                <dt className="truncate text-neutral-7">{m.details_gust_max()}</dt>
                <dd className="whitespace-nowrap">
                  {formatKnots(summary.strongest.value)}
                  <span className="text-neutral-7">
                    {" · "}
                    {formatDayAndClock(new Date(summary.strongest.time))}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        )}
      </Block>

      {footer}
    </div>
  );
}
