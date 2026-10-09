import { Skeleton } from "@repo/ui/components/ui/skeleton";
import type { ReactNode } from "react";

import { compassPoint, formatKnots, formatMeters, formatNumber, toKnots } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { DirectionArrow, HeightChip } from "./map-markers";
import {
  PointConditions,
  type PointConditionsProps,
  SeaChart,
  Section,
  Sources,
} from "./point-conditions";
import { DetailsPrototype, PrototypeSwitcher, useVariant } from "./prototype/prototype-switcher";
import { type Loadable, type Reading, type Station, type StationReadings, periodOf } from "./types";

type StationPanelProps = PointConditionsProps & {
  // What the map already knows of the station, shown while its history loads.
  station: Station | undefined;
  history: Loadable<StationReadings>;
};

// A figure with its label. While it loads, a bar of the same height holds its place.
function Stat({
  label,
  value,
  unit,
  detail,
  adornment,
  loading = false,
}: {
  label: string;
  // Null for a value the station does not report.
  value?: string | null;
  unit?: string;
  // A second figure, written small beside the label, such as a bearing in degrees.
  detail?: string;
  adornment?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="grid content-start gap-xxs rounded-(--radius-xs) bg-neutral-2 px-s py-xs">
      <div className="flex justify-between gap-xxs text-xs text-neutral-7">
        <span className="truncate">{label}</span>
        {!loading && detail && <span className="tabular-nums">{detail}</span>}
      </div>
      {loading ? (
        <Skeleton className="h-(--line-l) w-14 rounded-(--radius-xs)" />
      ) : (
        <div className="flex items-center gap-xxs text-l font-medium tabular-nums">
          {adornment}
          <span className="truncate">
            {value ?? "–"}
            {value != null && unit && (
              <span className="ml-0.5 text-s font-normal text-neutral-7">{unit}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function periodLabel(reading: Reading | null | undefined) {
  if (reading?.peakPeriodSeconds != null) return m.station_period_peak();
  if (reading?.significantPeriodSeconds != null) return m.station_period_significant();
  if (reading?.meanPeriodSeconds != null) return m.station_period_mean();
  return m.station_period();
}

function number(value: number | null | undefined, digits = 1) {
  return value == null ? null : formatNumber(value, digits);
}

function Now({
  station,
  reading,
  loading,
}: {
  station: Pick<Station, "measures"> | undefined;
  reading: Reading | null | undefined;
  loading: boolean;
}) {
  // A station that is still unknown is laid out as a wave buoy, the most common kind.
  const measuresWaves = station?.measures.includes("waves") ?? true;
  const measuresWind = station?.measures.includes("wind") ?? false;
  const height = reading?.significantHeightMeters ?? null;
  const direction = reading?.peakDirectionDegrees ?? null;
  const windSpeed = toKnots(reading?.windSpeedMetersPerSecond);
  const windDirection = reading?.windDirectionDegrees ?? null;

  if (!loading && !reading) {
    return <p className="text-s text-neutral-7">{m.station_no_reading()}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-xs">
      {measuresWaves && (
        <>
          <Stat
            label={m.station_height()}
            loading={loading}
            value={number(height)}
            unit={m.unit_m()}
            adornment={
              height !== null && (
                <HeightChip heightMeters={height} directionDegrees={null} className="size-3" />
              )
            }
          />
          <Stat
            label={periodLabel(reading)}
            loading={loading}
            value={number(periodOf(reading))}
            unit={m.unit_s()}
          />
          <Stat
            label={m.station_direction()}
            loading={loading}
            value={direction === null ? null : compassPoint(direction)}
            detail={direction === null ? undefined : `${formatNumber(direction, 0)}°`}
            adornment={direction !== null && <DirectionArrow fromDegrees={direction} />}
          />
          <Stat
            label={m.station_max_height()}
            loading={loading}
            value={number(reading?.maxHeightMeters)}
            unit={m.unit_m()}
          />
          <Stat
            label={m.station_water()}
            loading={loading}
            value={number(reading?.waterTemperatureCelsius)}
            unit="°C"
          />
        </>
      )}
      {(measuresWind || windSpeed !== null) && (
        <>
          <Stat
            label={m.station_wind()}
            loading={loading}
            value={number(windSpeed, 0)}
            unit={m.unit_kn()}
            adornment={
              windSpeed !== null && (
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: scaleColor(WIND_SPEED_SCALE, windSpeed) }}
                />
              )
            }
          />
          {measuresWind && (
            <>
              <Stat
                label={m.station_gusts()}
                loading={loading}
                value={number(toKnots(reading?.windGustMetersPerSecond), 0)}
                unit={m.unit_kn()}
              />
              <Stat
                label={m.station_wind_direction()}
                loading={loading}
                value={windDirection === null ? null : compassPoint(windDirection)}
                detail={windDirection === null ? undefined : `${formatNumber(windDirection, 0)}°`}
                adornment={windDirection !== null && <DirectionArrow fromDegrees={windDirection} />}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** What a station measures now and lately, then the forecast and the tide where it floats. */
export function StationPanel({
  now,
  station: known,
  history,
  forecast,
  tides,
  extremes,
  onTideExtend,
}: StationPanelProps) {
  const variant = useVariant();
  const station = history.data?.station ?? known;
  const readings = history.data?.readings ?? [];
  const latest = readings[0] ?? known?.latestReading;
  // The map's list already holds the latest reading, so only a station opened by its address waits.
  const loadingNow = !latest && history.isPending;

  if (history.isError && !known) {
    return <p className="text-s text-neutral-7">{m.station_not_found()}</p>;
  }

  const measuresWaves = station?.measures.includes("waves") ?? true;
  const measuresWind = station?.measures.includes("wind") ?? false;

  // PROTOTYPE: a variant of the panel, chosen in the address. See prototype/details-prototype.tsx.
  if (variant) {
    return (
      <div className="grid gap-l">
        {station?.exposure === "sheltered" && (
          <p className="rounded-(--radius-xs) bg-warning-transparent px-s py-xs text-s">
            {m.station_sheltered_note()}
          </p>
        )}
        <DetailsPrototype
          now={now}
          station={station}
          readings={history.data?.readings}
          latest={latest}
          historyPending={history.isPending}
          forecast={forecast}
          tides={tides}
          extremes={extremes}
          onTideExtend={onTideExtend}
          footer={
            <Sources
              origin={station && m.source_measurements({ attribution: station.attribution })}
              license={station?.license}
              forecast={forecast.data}
              tides={tides.data}
            />
          }
        />
        <PrototypeSwitcher />
      </div>
    );
  }

  return (
    <div className="grid gap-l">
      <PrototypeSwitcher />
      {station?.exposure === "sheltered" && (
        <p className="rounded-(--radius-xs) bg-warning-transparent px-s py-xs text-s">
          {m.station_sheltered_note()}
        </p>
      )}

      <Now station={station} reading={latest} loading={loadingNow} />

      {measuresWaves && (
        <Section title={m.station_measured_height()} note={m.station_last_48h()}>
          <SeaChart
            label={m.station_measured_height()}
            scale={WAVE_HEIGHT_SCALE}
            formatValue={formatMeters}
            isLoading={history.isPending}
            points={readings
              .map((reading) => ({
                time: reading.observedAt,
                value: reading.significantHeightMeters,
              }))
              .reverse()}
          />
        </Section>
      )}

      {measuresWind && (
        <Section title={m.station_measured_wind()} note={m.station_last_48h()}>
          <SeaChart
            label={m.station_measured_wind()}
            scale={WIND_SPEED_SCALE}
            formatValue={formatKnots}
            isLoading={history.isPending}
            points={readings
              .map((reading) => ({
                time: reading.observedAt,
                value: toKnots(reading.windSpeedMetersPerSecond),
              }))
              .reverse()}
          />
        </Section>
      )}

      <PointConditions
        now={now}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        onTideExtend={onTideExtend}
      />

      <Sources
        origin={station && m.source_measurements({ attribution: station.attribution })}
        license={station?.license}
        forecast={forecast.data}
        tides={tides.data}
      />
    </div>
  );
}
