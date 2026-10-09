import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { cn } from "@repo/ui/lib/utils";
import { type ComponentProps, type ReactNode, Suspense, lazy } from "react";

import {
  compassPoint,
  formatClock,
  formatDayAndClock,
  formatKnots,
  formatMeters,
  formatNumber,
  formatSeconds,
  toKnots,
} from "@/lib/format";
import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import type { Forecast, Loadable, TideExtremes, TideTimeline } from "./types";

// The chart library is heavy and only a panel draws with it, so it loads apart from the map.
// The viewer asks for it as soon as the map is up, and a box of the chart's size waits for it.
const LazySeaChart = lazy(() =>
  import("./sea-chart").then((module) => ({ default: module.SeaChart })),
);

export function SeaChart(props: ComponentProps<typeof LazySeaChart>) {
  return (
    <Suspense fallback={<Skeleton className="h-44 w-full rounded-(--radius-xs)" />}>
      <LazySeaChart {...props} />
    </Suspense>
  );
}

// Every third hour of the next day, enough to read the trend at a glance.
const FORECAST_ROWS = 8;
const TIDE_EXTREMES = 4;

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-xs">
      <div className="flex items-baseline justify-between gap-s">
        <h3 className="text-m font-medium">{title}</h3>
        {note && <span className="text-right text-s text-neutral-7">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function ForecastTable({ hours, loading }: { hours: Forecast["hours"]; loading: boolean }) {
  const cell = "py-1.5 pr-xs last:pr-0";
  // A rule above each row. A table row draws no shadow, so its cells carry it.
  const ruled = cn(cell, "shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]");
  return (
    <table className="w-full text-s tabular-nums">
      <thead className="text-left text-xs text-neutral-7">
        <tr>
          <th className={cn(cell, "font-normal")}>{m.forecast_time()}</th>
          <th className={cn(cell, "font-normal")}>{m.forecast_waves()}</th>
          <th className={cn(cell, "font-normal")}>{m.forecast_swell()}</th>
          <th className={cn(cell, "font-normal")}>{m.forecast_wind()}</th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: FORECAST_ROWS }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: 4 }, (_, column) => (
                  <td key={column} className={ruled}>
                    <Skeleton className="h-(--line-s) w-4/5 rounded-(--radius-xs)" />
                  </td>
                ))}
              </tr>
            ))
          : hours.map((hour) => {
              const windSpeed = toKnots(hour.windSpeedMetersPerSecond);
              return (
                <tr key={hour.time.toISOString()}>
                  <td className={cn(ruled, "text-neutral-7")}>{formatDayAndClock(hour.time)}</td>
                  <td className={ruled}>
                    <span className="flex items-center gap-xxs">
                      {hour.waveHeightMeters !== null && (
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            background: scaleColor(WAVE_HEIGHT_SCALE, hour.waveHeightMeters),
                          }}
                        />
                      )}
                      {hour.waveHeightMeters === null ? "–" : formatMeters(hour.waveHeightMeters)}
                      {hour.wavePeriodSeconds !== null && (
                        <span className="text-neutral-7">
                          {formatSeconds(hour.wavePeriodSeconds)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={ruled}>
                    {hour.swellHeightMeters === null ? "–" : formatMeters(hour.swellHeightMeters)}
                    {hour.swellDirectionDegrees !== null && (
                      <span className="text-neutral-7">
                        {" "}
                        {compassPoint(hour.swellDirectionDegrees)}
                      </span>
                    )}
                  </td>
                  <td className={ruled}>
                    {windSpeed === null ? "–" : formatKnots(windSpeed)}
                    {hour.windDirectionDegrees !== null && (
                      <span className="text-neutral-7">
                        {" "}
                        {compassPoint(hour.windDirectionDegrees)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
      </tbody>
    </table>
  );
}

function TideExtremesList({
  extremes,
  loading,
}: {
  extremes: TideExtremes["extremes"];
  loading: boolean;
}) {
  return (
    <ul className="grid grid-cols-2 gap-xs">
      {loading
        ? Array.from({ length: TIDE_EXTREMES }, (_, index) => (
            <li key={index} className="grid gap-xxs rounded-(--radius-xs) bg-neutral-2 px-s py-xs">
              <Skeleton className="h-(--line-xs) w-10 rounded-(--radius-xs)" />
              <Skeleton className="h-(--line-s) w-20 rounded-(--radius-xs)" />
            </li>
          ))
        : extremes.map((extreme) => (
            <li
              key={extreme.time.toISOString()}
              className="grid gap-xxs rounded-(--radius-xs) bg-neutral-2 px-s py-xs"
            >
              <span className="text-xs text-neutral-7">
                {extreme.type === "high" ? m.tide_high() : m.tide_low()}
              </span>
              <span className="text-s tabular-nums">
                {formatClock(extreme.time)}
                <span className="text-neutral-7"> · {formatMeters(extreme.heightMeters)}</span>
              </span>
            </li>
          ))}
    </ul>
  );
}

export type PointConditionsProps = {
  now: number;
  forecast: Loadable<Forecast>;
  tides: Loadable<TideTimeline>;
  extremes: Loadable<TideExtremes>;
};

/** The wave forecast and the tide at a point, whatever stands there: a buoy or a surf break. */
export function PointConditions({ now, forecast, tides, extremes }: PointConditionsProps) {
  const nextHours = (forecast.data?.hours ?? [])
    .filter((hour) => hour.time.getTime() >= now && hour.time.getUTCHours() % 3 === 0)
    .slice(0, FORECAST_ROWS);
  const nextExtremes = (extremes.data?.extremes ?? []).slice(0, TIDE_EXTREMES);

  return (
    <>
      <Section title={m.forecast_title()} note={m.forecast_note()}>
        {forecast.isPending || forecast.data ? (
          <>
            <SeaChart
              label={m.forecast_title()}
              scale={WAVE_HEIGHT_SCALE}
              formatValue={formatMeters}
              marker={new Date(now)}
              isLoading={forecast.isPending}
              points={(forecast.data?.hours ?? []).map((hour) => ({
                time: hour.time,
                value: hour.waveHeightMeters,
              }))}
            />
            <ForecastTable hours={nextHours} loading={forecast.isPending} />
          </>
        ) : (
          <p className="text-s text-neutral-7">{m.forecast_none()}</p>
        )}
      </Section>

      <Section
        title={m.tide_title()}
        note={
          tides.data &&
          m.tide_station({
            name: tides.data.station.name,
            distance: formatNumber(tides.data.station.distanceKm, 0),
          })
        }
      >
        {tides.isPending || tides.data ? (
          <>
            <SeaChart
              label={m.tide_title()}
              formatValue={formatMeters}
              marker={new Date(now)}
              isLoading={tides.isPending}
              points={(tides.data?.timeline ?? []).map((entry) => ({
                time: entry.time,
                value: entry.heightMeters,
              }))}
            />
            <TideExtremesList extremes={nextExtremes} loading={extremes.isPending} />
          </>
        ) : (
          <p className="text-s text-neutral-7">{m.tide_none()}</p>
        )}
      </Section>
    </>
  );
}

/**
 * Where a panel's figures come from. `origin` credits what stands at the point, with its licence,
 * and the forecast and the tide follow once they are known.
 */
export function Sources({
  origin,
  license,
  forecast,
  tides,
}: {
  // Undefined while the station or the break loads.
  origin: string | undefined;
  license: { type: string; url: string } | undefined;
  forecast: Forecast | undefined;
  tides: TideTimeline | undefined;
}) {
  return (
    <footer className="grid gap-xxs text-xs text-neutral-7">
      {origin && license ? (
        <p>
          {origin}{" "}
          <a
            className="underline underline-offset-2 hover:text-neutral-10"
            href={license.url}
            target="_blank"
            rel="noreferrer"
          >
            {license.type}
          </a>
        </p>
      ) : (
        <Skeleton className="h-(--line-xs) w-3/4 rounded-(--radius-xs)" />
      )}
      {forecast && <p>{m.source_forecast({ attribution: forecast.source.attribution })}</p>}
      {tides && <p>{m.source_tide({ datum: tides.datum, source: tides.station.source.name })}</p>}
    </footer>
  );
}
