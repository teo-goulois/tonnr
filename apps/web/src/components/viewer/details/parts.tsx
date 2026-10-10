import { Button } from "@repo/ui/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@repo/ui/components/ui/popover";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { ChevronDownIcon, ChevronRightIcon, InfoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useState } from "react";

import { formatAgo, formatMeters, formatNumber, formatSeconds, freshnessOf } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow, HeightChip } from "../map-markers";
import type { PointConditionsProps } from "../point-conditions";
import { type Reading, type Station, periodOf } from "../types";
import { LineGlyph } from "./line-glyph";
import {
  DAY_MS,
  HOUR_MS,
  METRIC_KEYS,
  type Metric,
  type Sample,
  bias,
  describeDirection,
  directionAt,
  distanceKm,
  formatMetric,
  metricColor,
  metrics,
  valueAt,
} from "./metrics";

/** The buoy a surf break's sea is read on, and how far it floats. */
export type Nearby = { station: Station; distanceKm: number };

/** What the panel is given, for a buoy or for a surf break, already put on one footing. */
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
  // At a surf break: the buoy to read the sea on, and how to open it.
  nearby?: Nearby;
  onOpenStation?: (stationId: string) => void;
  // What credits the data.
  footer: ReactNode;
};

// A reading older than this no longer stands for the sea now.
const LIVE_REACH = 3 * HOUR_MS;
// A buoy further than this says little of the sea at a spot.
const NEARBY_KM = 150;

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
    bearing,
  };
}

/** A title with, on its right, the controls of what it heads. */
export function Block({
  title,
  control,
  children,
}: {
  title: string;
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-s">
      <div className="flex min-h-7 items-center justify-between gap-s">
        <h3 className="text-m font-medium">{title}</h3>
        {control && <div className="flex items-center gap-xxs">{control}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * The four values now, each on its tile. Beside a buoy's figure, the dashed line of the model
 * and what the model says. A value the buoy does not measure is the model's, and says so.
 */
export function NowTiles(props: DetailsProps) {
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
            {/* A surf break has the model alone: nothing to tell apart, so nothing is written. */}
            {props.hasBuoy && (
              <div className="flex h-(--line-xs) items-center gap-xxs text-xs text-neutral-7 tabular-nums">
                {!loading && read.model !== undefined && (
                  <>
                    <LineGlyph dashed />
                    <span className="truncate">
                      {read.measured === undefined
                        ? m.details_model()
                        : formatMetric(metric, read.model, false)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What a buoy reads beside the four values. It stays folded until it is asked for. */
export function ReadingMore({ latest }: { latest?: Reading | null }) {
  const [open, setOpen] = useState(false);
  if (!latest) return null;

  // A buoy gives one period among three, and the model's is a mean one: the list says which.
  const period =
    latest.peakPeriodSeconds !== null
      ? m.station_period_peak()
      : latest.significantPeriodSeconds !== null
        ? m.station_period_significant()
        : latest.meanPeriodSeconds !== null
          ? m.station_period_mean()
          : null;
  const periodValue = periodOf(latest);
  const rows = [
    latest.peakDirectionDegrees !== null && [
      m.details_direction(),
      describeDirection(latest.peakDirectionDegrees),
    ],
    latest.maxHeightMeters !== null && [
      m.details_max_height(),
      formatMeters(latest.maxHeightMeters),
    ],
    period !== null && periodValue !== null && [period, formatSeconds(periodValue)],
    latest.waterTemperatureCelsius !== null && [
      m.details_water(),
      `${formatNumber(latest.waterTemperatureCelsius)} °C`,
    ],
  ].filter((row) => row !== false);
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-xs">
      <Button
        variant="ghost"
        size="xs"
        className="-my-xxs justify-self-end text-xs text-neutral-7"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {m.details_more()}
        <ChevronDownIcon
          data-slot="icon"
          aria-hidden
          className={cn(
            "transition-[rotate] duration-(--motion-duration) ease-theme",
            open && "rotate-180",
          )}
        />
      </Button>
      {open && (
        <dl className="grid grid-cols-2 gap-x-s gap-y-xxs text-xs tabular-nums">
          {rows.map(([name, value]) => (
            <div key={name} className="flex items-baseline justify-between gap-xs">
              <dt className="truncate text-neutral-7">{name}</dt>
              <dd className="whitespace-nowrap">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** What there is to know before trusting the curves, behind a button so the panel stays bare. */
export function About(props: DetailsProps) {
  const height = metrics().height;
  const drift = bias(props.measured, props.model, "height", props.now - DAY_MS);
  const notes = [
    drift !== undefined &&
      (Math.abs(drift) < 0.15
        ? m.details_bias_none()
        : (drift > 0 ? m.details_bias_high : m.details_bias_low)({
            value: formatMetric(height, Math.abs(drift)),
          })),
    m.details_model_note(),
    !props.measuresWind && m.details_no_wind_sensor(),
  ].filter((note) => note !== false);

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-xs" className="text-neutral-7" />}
        aria-label={m.details_about()}
      >
        <InfoIcon data-slot="icon" aria-hidden />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72 rounded-(--radius-xs) p-s text-s">
        {notes.map((note) => (
          <p key={note} className="text-pretty">
            {note}
          </p>
        ))}
      </PopoverPopup>
    </Popover>
  );
}

/** The buoy nearest a surf break that still reports, among those the sea reaches freely. */
export function nearestBuoy(
  stations: Station[],
  place: { latitude: number; longitude: number },
  now: number,
) {
  let nearest: Nearby | undefined;
  for (const station of stations) {
    const reading = station.latestReading;
    if (station.exposure === "sheltered" || reading?.significantHeightMeters == null) continue;
    if (freshnessOf(reading.observedAt, now) === "none") continue;
    const distance = distanceKm(place, station);
    if (distance <= NEARBY_KM && (!nearest || distance < nearest.distanceKm)) {
      nearest = { station, distanceKm: distance };
    }
  }
  return nearest;
}

/** What the nearest buoy measures, at a surf break. It opens the buoy's own panel. */
export function NearbyBuoy({
  nearby,
  now,
  onOpen,
}: {
  nearby: Nearby;
  now: number;
  onOpen?: (stationId: string) => void;
}) {
  const { station } = nearby;
  const reading = station.latestReading;
  if (!reading || reading.significantHeightMeters === null) return null;
  const period = periodOf(reading);

  return (
    <button
      type="button"
      className="focus-ring flex cursor-pointer items-center gap-s rounded-(--radius-xs) bg-neutral-2 px-s py-xs text-left outline-none hover:bg-neutral-3"
      onClick={() => onOpen?.(station.id)}
    >
      <HeightChip
        heightMeters={reading.significantHeightMeters}
        directionDegrees={reading.peakDirectionDegrees}
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline gap-xs">
          <span className="text-s font-medium tabular-nums">
            {formatMeters(reading.significantHeightMeters)}
            {period !== null && (
              <span className="font-normal text-neutral-7"> {formatSeconds(period)}</span>
            )}
          </span>
          <span className="text-xs text-neutral-7">{formatAgo(reading.observedAt, now)}</span>
        </span>
        <span className="truncate text-xs text-neutral-7">
          {m.details_nearest_buoy({ distance: formatNumber(nearby.distanceKm, 0) })}
          {" · "}
          {station.name}
        </span>
      </span>
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-neutral-7" />
    </button>
  );
}
