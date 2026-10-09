// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { useState } from "react";

import { compassPoint } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow } from "../map-markers";
import { TideChart } from "../point-conditions";
import { ForecastGrid } from "./forecast-grid";
import { MetricChart } from "./metric-chart";
import { LaneCurve, useWidth } from "./metric-lanes";
import {
  DAY_MS,
  HOUR_MS,
  METRIC_KEYS,
  type Metric,
  type MetricKey,
  formatDelta,
  formatMetric,
  metrics,
  t,
} from "./metrics";
import { Block, type DetailsProps, ReadingDetails, ViewToggle, nowOf } from "./parts";

export const VARIANT_B_NAME = "Focus";

/** A value now, with how it has moved and where it goes. It chooses what the chart below shows. */
function MetricTab({
  metric,
  selected,
  onSelect,
  props,
}: {
  metric: Metric;
  selected: boolean;
  onSelect: () => void;
  props: DetailsProps;
}) {
  const strings = t();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const width = useWidth(box);
  const read = nowOf(metric, props);
  const loading = props.hasBuoy ? props.historyPending && !props.latest : props.forecast.isPending;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        "focus-ring grid cursor-pointer content-start gap-xxs rounded-(--radius-xs) px-s pt-xs pb-xs text-left outline-none",
        selected
          ? "edge bg-neutral-1 [--edge-color:var(--neutral-10)]"
          : "bg-neutral-2 hover:bg-neutral-3",
      )}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-xxs text-xs text-neutral-7">
        {metric.label}
        {read.bearing !== undefined && (
          <span className="flex items-center gap-0.5 text-neutral-10">
            <DirectionArrow fromDegrees={read.bearing} className="size-3" />
            {compassPoint(read.bearing)}
          </span>
        )}
      </span>
      <span className="flex items-baseline justify-between gap-xs">
        {loading ? (
          <Skeleton className="h-(--line-l) w-12 rounded-(--radius-xs)" />
        ) : (
          <span className="text-l font-medium tabular-nums">
            {read.shown === undefined ? "–" : formatMetric(metric, read.shown, false)}
            {read.shown !== undefined && (
              <span className="ml-0.5 text-s font-normal text-neutral-7">{metric.unit}</span>
            )}
          </span>
        )}
        {!loading && read.shown !== undefined && (
          <span className="truncate text-xs text-neutral-7 tabular-nums">
            {read.delta === undefined
              ? read.measured === undefined
                ? strings.model
                : strings.buoy
              : `${strings.model} ${formatDelta(metric, read.delta)}`}
          </span>
        )}
      </span>
      <div ref={setBox} className="h-7">
        <LaneCurve
          metric={metric}
          measured={props.measured}
          model={props.model}
          start={props.now - (props.hasBuoy ? DAY_MS : 0)}
          end={props.now + DAY_MS}
          now={props.now}
          nights={[]}
          width={width}
          height={28}
          bare
        />
      </div>
    </button>
  );
}

type Range = "live" | "week";

/**
 * Variant B. The four values are four tabs, each with its figure and its trend. One large chart
 * shows the chosen one, the buoy over the model, and the week ahead is a grid.
 */
export function VariantB(props: DetailsProps) {
  const strings = t();
  const { now, model, measured, hasBuoy, forecast, tides, extremes } = props;
  const all = metrics();
  const [selected, setSelected] = useState<MetricKey>("height");
  const [range, setRange] = useState<Range>("live");
  const first = model[0]?.time ?? now;
  const last = model.at(-1)?.time ?? now;
  const span =
    range === "live"
      ? {
          start: Math.max(first, now - (hasBuoy ? 2 * DAY_MS : 3 * HOUR_MS)),
          end: Math.min(last, now + 2 * DAY_MS),
        }
      : { start: Math.max(first, now - (hasBuoy ? DAY_MS : 3 * HOUR_MS)), end: last };

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <div role="tablist" className="grid grid-cols-2 gap-xs">
          {METRIC_KEYS.map((key) => (
            <MetricTab
              key={key}
              metric={all[key]}
              selected={key === selected}
              onSelect={() => setSelected(key)}
              props={props}
            />
          ))}
        </div>
        <ReadingDetails latest={props.latest} />
      </div>

      {forecast.isPending || forecast.data ? (
        <>
          <Block
            title={all[selected].label}
            note={all[selected].unit}
            control={
              <ViewToggle
                value={range}
                options={[
                  { value: "live", label: "48 h" },
                  { value: "week", label: `7 ${strings.days}` },
                ]}
                onChange={setRange}
              />
            }
          >
            <MetricChart
              metric={all[selected]}
              measured={measured}
              model={model}
              start={span.start}
              end={span.end}
              now={now}
              isLoading={forecast.isPending}
            />
            {hasBuoy && !props.measuresWind && selected === "wind" && (
              <p className="text-xs text-neutral-7">{strings.noWindSensor}</p>
            )}
          </Block>

          <Block title={strings.longRange} note={strings.longRangeNote}>
            <ForecastGrid
              model={model}
              start={now - 1.5 * HOUR_MS}
              end={last}
              now={now}
              place={props.place}
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
