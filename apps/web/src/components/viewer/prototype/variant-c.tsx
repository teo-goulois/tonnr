// PROTOTYPE: thrown away once a variant of the details panel has won. See details-prototype.tsx.

import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Switch } from "@repo/ui/components/ui/switch";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages.js";

import { DirectionArrow } from "../map-markers";
import { ForecastGrid, type GridTide } from "./forecast-grid";
import { DAY_MS, HOUR_MS, METRIC_KEYS, formatMetric, metricColor, metrics, t } from "./metrics";
import { BiasNote, type DetailsProps, ReadingDetails, nowOf } from "./parts";

export const VARIANT_C_NAME = "One strip";

/** The four values now on one line, without tiles: the grid under it is what is read. */
function NowLine(props: DetailsProps) {
  const strings = t();
  const all = metrics();
  const loading = props.hasBuoy ? props.historyPending && !props.latest : props.forecast.isPending;

  return (
    <dl className="grid grid-cols-4">
      {METRIC_KEYS.map((key, index) => {
        const metric = all[key];
        const read = nowOf(metric, props);
        return (
          <div
            key={key}
            className={
              index === 0
                ? "grid gap-0.5 pr-xs"
                : "grid gap-0.5 px-xs shadow-[inset_var(--border-s)_0_0_var(--neutral-4)]"
            }
          >
            <dt className="flex items-center gap-1 text-xs text-neutral-7">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  background:
                    read.shown === undefined ? "var(--neutral-4)" : metricColor(metric, read.shown),
                }}
              />
              <span className="truncate">{metric.label}</span>
            </dt>
            <dd className="grid gap-0.5">
              {loading ? (
                <Skeleton className="h-(--line-l) w-10 rounded-(--radius-xs)" />
              ) : (
                <span className="flex items-center gap-0.5 text-l font-medium tabular-nums">
                  <span className="truncate">
                    {read.shown === undefined ? "–" : formatMetric(metric, read.shown, false)}
                    {read.shown !== undefined && (
                      <span className="ml-0.5 text-xs font-normal text-neutral-7">
                        {metric.unit}
                      </span>
                    )}
                  </span>
                  {read.bearing !== undefined && (
                    <DirectionArrow fromDegrees={read.bearing} className="size-3" />
                  )}
                </span>
              )}
              <span className="h-(--line-xs) truncate text-xs text-neutral-7 tabular-nums">
                {!loading &&
                  read.shown !== undefined &&
                  (read.measured === undefined
                    ? strings.model
                    : read.model === undefined
                      ? strings.buoy
                      : `${strings.model} ${formatMetric(metric, read.model, false)}`)}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Variant C. One grid to scroll, from two days ago to next week: the curves of the swell and of
 * the wind, the figures under them, the buoy's rows beside the model's, and the tide as its last
 * row. Everything shares one line of time.
 */
export function VariantC(props: DetailsProps) {
  const strings = t();
  const { now, model, measured, place, hasBuoy, forecast, tides, extremes } = props;
  const [compare, setCompare] = useState(true);
  const first = model[0]?.time ?? now;
  const last = model.at(-1)?.time ?? now;

  const tide = useMemo<GridTide | undefined>(() => {
    if (!tides.data) return undefined;
    return {
      points: tides.data.timeline.map((entry) => ({
        time: entry.time.getTime(),
        value: entry.heightMeters,
      })),
      extremes: (extremes.data?.extremes ?? []).map((extreme) => ({
        time: extreme.time.getTime(),
        value: extreme.heightMeters,
        high: extreme.type === "high",
      })),
    };
  }, [tides.data, extremes.data]);
  // The tide loaded stops before the model does: the grid ends where both are known.
  const tideEnd = tide?.points.at(-1)?.time;

  return (
    <div className="grid gap-m">
      <div className="grid gap-xs">
        <NowLine {...props} />
        <ReadingDetails latest={props.latest} />
      </div>

      {forecast.isPending || forecast.data ? (
        <div className="grid gap-xs">
          <ForecastGrid
            model={model}
            measured={hasBuoy && compare ? measured : undefined}
            start={Math.max(first, now - (hasBuoy ? 2 * DAY_MS : 1.5 * HOUR_MS))}
            end={tideEnd === undefined ? last : Math.min(last, tideEnd)}
            now={now}
            place={place}
            tide={tide}
            curves
            lead={hasBuoy ? 3 : 0}
            isLoading={forecast.isPending}
            toolbar={
              hasBuoy && (
                <label className="flex cursor-pointer items-center gap-xs text-xs">
                  <Switch checked={compare} onCheckedChange={setCompare} />
                  {strings.compare}
                </label>
              )
            }
          />
          {hasBuoy && <BiasNote {...props} />}
          {hasBuoy && !props.measuresWind && (
            <p className="text-xs text-neutral-7">{strings.noWindSensor}</p>
          )}
          {hasBuoy && <p className="text-xs text-neutral-7">{strings.modelNote}</p>}
        </div>
      ) : (
        <p className="text-s text-neutral-7">{m.forecast_none()}</p>
      )}

      {props.footer}
    </div>
  );
}
