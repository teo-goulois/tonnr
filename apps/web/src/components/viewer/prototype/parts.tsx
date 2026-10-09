// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow } from "../map-markers";
import type { PointConditionsProps } from "../point-conditions";
import type { Reading, Station } from "../types";
import {
  DAY_MS,
  HOUR_MS,
  METRIC_KEYS,
  type Metric,
  type MetricKey,
  type Sample,
  bias,
  describeDirection,
  directionAt,
  formatMetric,
  metricColor,
  metrics,
  t,
  valueAt,
} from "./metrics";

/** What every variant of the panel is given: the same data, already put on one footing. */
export type DetailsProps = PointConditionsProps & {
  // Undefined at a surf break, which has no buoy.
  station?: Pick<Station, "latitude" | "longitude" | "measures">;
  latest?: Reading | null;
  // The buoy's readings and the model's hours, oldest first.
  measured: Sample[];
  model: Sample[];
  place?: { latitude: number; longitude: number };
  hasBuoy: boolean;
  measuresWind: boolean;
  historyPending: boolean;
  // What credits the data, the same under every variant.
  footer: ReactNode;
};

// A reading older than this no longer stands for the sea now.
const LIVE_REACH = 3 * HOUR_MS;

/** What a metric reads now: the buoy's last reading when it is recent, and the model at that time. */
export function nowOf(metric: Metric, { measured, model, now }: DetailsProps) {
  const last = measured.filter((sample) => sample[metric.key] !== null).at(-1);
  const live = last && now - last.time <= LIVE_REACH ? last : undefined;
  const at = live?.time ?? now;
  const measuredValue = live?.[metric.key] ?? undefined;
  const modelValue = valueAt(model, metric.key, at);
  const measuredBearing = live && metric.direction ? live[metric.direction] : null;
  const bearing =
    measuredBearing ?? (metric.direction ? directionAt(model, metric.direction, at) : undefined);
  return {
    measured: measuredValue,
    model: modelValue,
    shown: measuredValue ?? modelValue,
    delta:
      measuredValue !== undefined && modelValue !== undefined
        ? modelValue - measuredValue
        : undefined,
    bearing,
  };
}

/** Two views of the same thing, chosen by one control. */
export function ViewToggle<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <div role="radiogroup" className="flex rounded-full bg-neutral-3 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={cn(
            "focus-ring h-6 cursor-pointer rounded-full px-xs text-xs outline-none",
            option.value === value
              ? "edge bg-neutral-1 font-medium [--edge-color:var(--neutral-10-transparent)]"
              : "text-neutral-7 hover:text-neutral-10",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A title with, on its right, what the section covers or the control that changes its view. */
export function Block({
  title,
  note,
  control,
  children,
}: {
  title: string;
  note?: ReactNode;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-xs">
      <div className="flex min-h-7 items-center justify-between gap-s">
        <h3 className="flex items-baseline gap-xs text-m font-medium">
          {title}
          {note && <span className="text-xs font-normal text-neutral-7">{note}</span>}
        </h3>
        {control}
      </div>
      {children}
    </section>
  );
}

/** The four values now, each on its tile: the buoy's figure, and what the model says beside it. */
export function NowTiles(props: DetailsProps) {
  const strings = t();
  const all = metrics();
  const loading = props.hasBuoy ? props.historyPending && !props.latest : props.forecast.isPending;

  return (
    <div className="grid grid-cols-4 gap-xs">
      {METRIC_KEYS.map((key) => {
        const metric = all[key];
        const read = nowOf(metric, props);
        return (
          <div
            key={key}
            className="grid content-start gap-xxs rounded-(--radius-xs) bg-neutral-2 px-xs py-xs"
          >
            <div className="flex items-center justify-between gap-xxs text-xs text-neutral-7">
              <span className="truncate">{metric.label}</span>
              {read.bearing !== undefined && (
                <DirectionArrow fromDegrees={read.bearing} className="size-3 text-neutral-10" />
              )}
            </div>
            {loading ? (
              <Skeleton className="h-(--line-l) w-10 rounded-(--radius-xs)" />
            ) : (
              <div className="truncate text-l font-medium tabular-nums">
                {read.shown === undefined ? "–" : formatMetric(metric, read.shown, false)}
                {read.shown !== undefined && (
                  <span className="ml-0.5 text-xs font-normal text-neutral-7">{metric.unit}</span>
                )}
              </div>
            )}
            <span
              aria-hidden
              className="h-1 w-6 rounded-full"
              style={{
                background:
                  loading || read.shown === undefined
                    ? "var(--neutral-4)"
                    : metricColor(metric, read.shown),
              }}
            />
            <div className="h-(--line-xs) truncate text-xs text-neutral-7 tabular-nums">
              {!loading &&
                read.shown !== undefined &&
                (read.measured === undefined
                  ? strings.model
                  : read.model === undefined
                    ? strings.buoy
                    : `${strings.model} ${formatMetric(metric, read.model, false)}`)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** What a buoy reads beside the four values, on one line. */
export function ReadingDetails({ latest }: { latest?: Reading | null }) {
  const strings = t();
  if (!latest) return null;
  // A buoy gives one period among three, and the model's is a mean one: the line says which.
  const period =
    latest.peakPeriodSeconds !== null
      ? m.station_period_peak()
      : latest.significantPeriodSeconds !== null
        ? m.station_period_significant()
        : latest.meanPeriodSeconds !== null
          ? m.station_period_mean()
          : null;
  const details = [
    period,
    latest.peakDirectionDegrees !== null && describeDirection(latest.peakDirectionDegrees),
    latest.maxHeightMeters !== null && `${strings.max} ${formatNumber(latest.maxHeightMeters)} m`,
    latest.waterTemperatureCelsius !== null &&
      `${strings.water} ${formatNumber(latest.waterTemperatureCelsius)} °C`,
  ].filter(Boolean);
  if (details.length === 0) return null;
  return <p className="text-xs text-neutral-7 tabular-nums">{details.join(" · ")}</p>;
}

/** How far the model has stood from the buoy over a day, in a sentence. */
export function BiasNote({ measured, model, now }: DetailsProps) {
  const strings = t();
  const height = metrics().height;
  const drift = bias(measured, model, "height", now - DAY_MS);
  if (drift === undefined) return null;
  const sentence =
    Math.abs(drift) < 0.15
      ? strings.biasNone
      : (drift > 0 ? strings.biasHigh : strings.biasLow).replace(
          "{value}",
          formatMetric(height, Math.abs(drift)),
        );
  return <p className="text-xs text-neutral-7">{sentence}</p>;
}

/** The span of the live view: two days each way around a buoy, the two days ahead elsewhere. */
export function liveSpan({ hasBuoy, now, model }: DetailsProps) {
  const first = model[0]?.time ?? now;
  const last = model.at(-1)?.time ?? now;
  return hasBuoy
    ? { start: Math.max(first, now - 2 * DAY_MS), end: Math.min(last, now + 2 * DAY_MS) }
    : { start: Math.max(first, now - 3 * HOUR_MS), end: Math.min(last, now + 2 * DAY_MS) };
}

export type { MetricKey };
