import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { type ComponentProps, Fragment, type ReactNode, Suspense, lazy } from "react";

import { formatDayAndClock, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { useChartTurn } from "./chart-turns";
import { TideChartSkeleton } from "./tide-chart-skeleton";
import type { Forecast, Loadable, TideExtremes, TideTimeline } from "./types";

// The chart library is heavy and only a panel draws with it, so it loads apart from the map.
// The viewer asks for it as soon as the map is up, and a box of the chart's size waits for it.
const LazyTideChart = lazy(() =>
  import("./tide-chart").then((module) => ({ default: module.TideChart })),
);

export function TideChart(props: ComponentProps<typeof LazyTideChart>) {
  const skeleton = <TideChartSkeleton className={props.className} />;
  if (!useChartTurn()) return skeleton;
  return (
    <Suspense fallback={skeleton}>
      <LazyTideChart {...props} />
    </Suspense>
  );
}

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

export type PointConditionsProps = {
  now: number;
  forecast: Loadable<Forecast>;
  tides: Loadable<TideTimeline>;
  extremes: Loadable<TideExtremes>;
  // Asks for one more day of tide, before the days loaded or after them.
  onTideExtend?: (direction: -1 | 1) => void;
};

// The models the waves come from, in the order of the hours: the first, then each one after it
// with the moment it takes over. A model without a peak period leaves that column empty at every
// hour, and the line of a forecast that has no other says that its period is the mean one.
function waveModelLines({ waveModels, hours }: Forecast) {
  const hasPeak = hours.some((hour) => hour.wavePeakPeriodSeconds !== null);
  return waveModels.map((model, index) => {
    const wide = model.resolutionKilometers;
    const said = {
      model: model.name,
      kilometers: Number.isInteger(wide) ? String(wide) : formatNumber(wide, 1),
    };
    if (index > 0)
      return m.source_wave_model_from({ ...said, date: formatDayAndClock(model.from) });
    return hasPeak ? m.source_wave_model(said) : m.source_wave_model_mean(said);
  });
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
  // Undefined while the station or the break loads. Null when nothing says where it comes from.
  origin: string | null | undefined;
  // Null when what stands at the point has no licence to name.
  license: { type: string; url: string } | null | undefined;
  forecast: Forecast | undefined;
  tides: TideTimeline | undefined;
}) {
  return (
    <footer className="grid gap-xxs text-xs text-neutral-7">
      {origin === null ? null : origin && license === null ? (
        <p>{origin}</p>
      ) : origin && license ? (
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
      {forecast && (
        <p>
          {m.source_forecast()}{" "}
          {forecast.source.credits.map((credit, index) => (
            <Fragment key={credit.url}>
              {index > 0 && ". "}
              <a
                className="underline underline-offset-2 hover:text-neutral-10"
                href={credit.url}
                target="_blank"
                rel="noreferrer"
              >
                {credit.text}
              </a>
            </Fragment>
          ))}
          .{forecast.source.notice && ` ${forecast.source.notice}`} {m.source_forecast_changes()}
        </p>
      )}
      {forecast && <p>{waveModelLines(forecast).join(" ")}</p>}
      {tides && <p>{m.source_tide({ datum: tides.datum, source: tides.station.source.name })}</p>}
    </footer>
  );
}
