import { forecastSource, type WaveModelId } from "@repo/conditions/forecasts/wave-models";
import type { ShoreWind } from "@repo/conditions/shore-wind";
import { cn } from "@repo/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

import { formatSeconds, toKnots } from "@/lib/format";
import { formatDistance, formatHeight, formatTemperature, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Session, SessionDetail } from "../viewer/types";

const SHORE_WIND_NAMES: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

// Why a session has nothing of the models, in words.
const MISSING: Record<NonNullable<Session["modelMissing"]>, () => string> = {
  no_sea: m.session_sea_none,
  too_old: m.session_sea_too_old,
  unavailable: m.session_sea_waiting,
};

// Parts on a line, with a point between two of them.
function Parts({ parts }: { parts: ReactNode[] }) {
  return (
    <>
      {parts.map((part, index) => (
        // The parts keep their order: nothing else tells them apart.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function wavesOf(figures: Session["figures"]) {
  const period = figures.wavePeakPeriodSeconds ?? figures.wavePeriodSeconds;
  return figures.waveHeightMeters === null
    ? []
    : [
        formatHeight(figures.waveHeightMeters),
        ...(period === null ? [] : [formatSeconds(period)]),
        ...(figures.waveDirectionDegrees === null
          ? []
          : [<Bearing degrees={figures.waveDirectionDegrees} />]),
      ];
}

function windOf(figures: Session["figures"]) {
  return figures.windSpeedMetersPerSecond === null
    ? []
    : [
        formatWind(toKnots(figures.windSpeedMetersPerSecond)),
        ...(figures.windDirectionDegrees === null
          ? []
          : [<Bearing degrees={figures.windDirectionDegrees} />]),
        ...(figures.shoreWind ? [SHORE_WIND_NAMES[figures.shoreWind]()] : []),
      ];
}

function tideOf(figures: Session["figures"]) {
  return figures.tideHeightMeters === null
    ? []
    : [
        formatHeight(figures.tideHeightMeters),
        ...(figures.tideTrend
          ? [figures.tideTrend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()]
          : []),
      ];
}

/**
 * What the sea did during a session, on a line: the waves, the wind and the tide at its middle.
 * A session of which the models gave nothing says why.
 */
export function SessionSea({
  session,
  className,
}: {
  session: Pick<Session, "figures" | "modelMissing">;
  className?: string;
}) {
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const { figures } = session;
  const groups: [string, ReactNode[]][] = [
    [m.alert_summary_waves(), wavesOf(figures)],
    [m.alert_summary_wind(), windOf(figures)],
    [m.alert_summary_tide(), tideOf(figures)],
  ];
  const said = groups.filter(([, parts]) => parts.length > 0);

  return (
    // Each thing the sea did stays whole on its line, and the next goes under it when the row is
    // narrow.
    <span className={cn("flex flex-wrap gap-x-s text-s text-neutral-7", className)}>
      {said.map(([name, parts]) => (
        <span key={name} className="whitespace-nowrap">
          {name} <Parts parts={parts} />
        </span>
      ))}
      {said.length === 0 && (session.modelMissing ? MISSING[session.modelMissing]() : null)}
    </span>
  );
}

function Line({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-s">
      <dt className="shrink-0 text-neutral-7">{name}</dt>
      <dd className="min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Everything that was kept of the sea with a session: the models' figures at its middle, then
 * what the buoy and the wind station near it measured, and whose all of it is.
 */
export function SessionConditions({ session }: { session: SessionDetail }) {
  useUnits();
  const { figures } = session;
  const waves = wavesOf(figures);
  const wind = windOf(figures);
  const tide = tideOf(figures);
  const sky = [
    ...(figures.airTemperatureCelsius === null
      ? []
      : [formatTemperature(figures.airTemperatureCelsius, 0)]),
    ...(figures.cloudCoverPercent === null
      ? []
      : [m.session_cloud({ percent: figures.cloudCoverPercent })]),
  ];
  const buoy = figures.buoy;
  const measured = figures.measuredWind;

  return (
    <section className="grid gap-s">
      <h3 className="font-medium">{m.session_sea_title()}</h3>
      {waves.length === 0 && session.modelMissing && (
        <p className="text-s text-neutral-7">{MISSING[session.modelMissing]()}</p>
      )}
      <dl className="grid gap-xs text-s">
        {waves.length > 0 && (
          <Line name={m.alert_summary_waves()}>
            <Parts parts={waves} />
          </Line>
        )}
        {figures.primarySwellHeightMeters !== null && (
          <Line name={m.alert_summary_swell()}>
            <Parts
              parts={[
                formatHeight(figures.primarySwellHeightMeters),
                ...(figures.primarySwellDirectionDegrees === null
                  ? []
                  : [<Bearing degrees={figures.primarySwellDirectionDegrees} />]),
              ]}
            />
          </Line>
        )}
        {wind.length > 0 && (
          <Line name={m.alert_summary_wind()}>
            <Parts
              parts={[
                ...wind,
                ...(figures.windGustMetersPerSecond === null
                  ? []
                  : [
                      m.session_gusts({
                        speed: formatWind(toKnots(figures.windGustMetersPerSecond)),
                      }),
                    ]),
              ]}
            />
          </Line>
        )}
        {tide.length > 0 && (
          <Line name={m.alert_summary_tide()}>
            <Parts parts={tide} />
          </Line>
        )}
        {sky.length > 0 && (
          <Line name={m.session_sky()}>
            <Parts parts={sky} />
          </Line>
        )}
        {buoy && buoy.significantHeightMeters !== null && (
          <Line
            name={m.session_buoy({ name: buoy.name, distance: formatDistance(buoy.distanceKm) })}
          >
            <Parts
              parts={[
                formatHeight(buoy.significantHeightMeters),
                ...(buoy.periodSeconds === null ? [] : [formatSeconds(buoy.periodSeconds)]),
                ...(buoy.directionDegrees === null
                  ? []
                  : [<Bearing degrees={buoy.directionDegrees} />]),
                ...(buoy.waterTemperatureCelsius === null
                  ? []
                  : [
                      m.session_water({
                        temperature: formatTemperature(buoy.waterTemperatureCelsius),
                      }),
                    ]),
              ]}
            />
          </Line>
        )}
        {measured && measured.speedMetersPerSecond !== null && (
          <Line
            name={m.session_wind_measured({
              name: measured.name,
              distance: formatDistance(measured.distanceKm),
            })}
          >
            <Parts
              parts={[
                formatWind(toKnots(measured.speedMetersPerSecond)),
                ...(measured.directionDegrees === null
                  ? []
                  : [<Bearing degrees={measured.directionDegrees} />]),
              ]}
            />
          </Line>
        )}
      </dl>
    </section>
  );
}

/** Whose a session's figures are: the models', the tide's station, and each station that measured. */
export function SessionCredits({ session }: { session: SessionDetail }) {
  const { conditions } = session;
  const models = [
    ...(conditions?.model?.waveModels ?? []),
    ...(conditions?.model?.swellModels ?? []),
  ];
  const credits = [
    models.length > 0 &&
      `${m.source_forecast()} ${forecastSource(models as WaveModelId[]).attribution}`,
    conditions?.tide &&
      m.session_tide_source({
        station: conditions.tide.station.name,
        datum: conditions.tide.datum,
      }),
    conditions?.buoy && m.session_station_source({ attribution: conditions.buoy.attribution }),
    conditions?.wind &&
      conditions.wind.attribution !== conditions.buoy?.attribution &&
      m.session_station_source({ attribution: conditions.wind.attribution }),
  ].filter(Boolean);
  if (credits.length === 0) return null;
  return <p className="text-xs text-pretty text-neutral-7">{credits.join(" ")}</p>;
}
