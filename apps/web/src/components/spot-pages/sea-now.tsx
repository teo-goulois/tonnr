import { Badge } from "@repo/ui/components/ui/badge";
import type { ReactNode } from "react";

import { Bearing } from "@/components/viewer/bearing";
import { SHORE_WIND_NAMES } from "@/components/viewer/details/parts";
import { periodOf } from "@/components/viewer/types";
import { formatAgo, formatSeconds, toKnots } from "@/lib/format";
import type { NearStation, NearWind } from "@/lib/pages-api";
import { WAVES_WITHIN_KM } from "@/lib/spot-pages";
import { formatDistance, formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { SpotSection } from "./spot-frame";

// The sea now at a surf break: the nearest buoy and the nearest wind station that measured lately,
// each with its latest reading and when it was taken. Decision 057.

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-xxs">
      <dt className="text-s text-neutral-7">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function StationCard({
  name,
  where,
  observedAt,
  now,
  children,
}: {
  name: string;
  where: string;
  observedAt: Date;
  now: number;
  children: ReactNode;
}) {
  return (
    <article className="grid content-start gap-s rounded-(--radius-xs) bg-neutral-2 p-m">
      <header className="grid gap-xxs">
        <h3 className="font-medium">{name}</h3>
        <p className="text-s text-neutral-7">{where}</p>
      </header>
      <dl className="grid grid-cols-3 gap-s">{children}</dl>
      <p className="text-s text-neutral-7">
        {m.page_measured_ago({ ago: formatAgo(observedAt, now) })}
      </p>
    </article>
  );
}

function Buoy({ station, now }: { station: NearStation; now: number }) {
  const reading = station.latestReading;
  const period = periodOf(reading);
  return (
    <StationCard
      name={station.name}
      where={m.page_buoy_away({ distance: formatDistance(station.distanceKm) })}
      observedAt={reading.observedAt}
      now={now}
    >
      <Figure label={m.details_waves()}>
        {reading.significantHeightMeters === null
          ? "–"
          : formatHeight(reading.significantHeightMeters)}
      </Figure>
      <Figure label={m.details_period()}>{period === null ? "–" : formatSeconds(period)}</Figure>
      <Figure label={m.details_direction()}>
        {reading.peakDirectionDegrees === null ? (
          "–"
        ) : (
          <Bearing degrees={reading.peakDirectionDegrees} />
        )}
      </Figure>
    </StationCard>
  );
}

function WindStation({ station, now }: { station: NearWind; now: number }) {
  const reading = station.latestReading;
  const speed = toKnots(reading.windSpeedMetersPerSecond);
  const gust = toKnots(reading.windGustMetersPerSecond);
  return (
    <StationCard
      name={station.name}
      where={m.page_wind_station_away({ distance: formatDistance(station.distanceKm) })}
      observedAt={reading.observedAt}
      now={now}
    >
      <Figure label={m.details_wind()}>{speed === null ? "–" : formatWind(speed)}</Figure>
      <Figure label={m.details_gusts()}>{gust === null ? "–" : formatWind(gust)}</Figure>
      <Figure label={m.details_direction()}>
        <span className="flex flex-wrap items-center gap-xs">
          {reading.windDirectionDegrees === null ? (
            "–"
          ) : (
            <Bearing degrees={reading.windDirectionDegrees} />
          )}
          {station.atShore && <Badge>{SHORE_WIND_NAMES[station.atShore]()}</Badge>}
        </span>
      </Figure>
    </StationCard>
  );
}

/**
 * What the sea does at a break now, as the nearest stations measured it. A station that is
 * missing says so in a sentence in its place.
 */
export function SeaNow({
  waves,
  wind,
  now,
}: {
  waves: NearStation | null;
  wind: NearWind | null;
  now: number;
}) {
  useUnits();
  return (
    <SpotSection title={m.page_sea_now()}>
      <div className="grid gap-s sm:grid-cols-2">
        {waves ? (
          <Buoy station={waves} now={now} />
        ) : (
          <p className="text-neutral-7">
            {m.page_no_buoy({ distance: formatDistance(WAVES_WITHIN_KM) })}
          </p>
        )}
        {wind ? (
          <WindStation station={wind} now={now} />
        ) : (
          <p className="text-neutral-7">{m.page_no_wind()}</p>
        )}
      </div>
    </SpotSection>
  );
}
