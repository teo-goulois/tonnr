import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

import { LineChart } from "./line-chart";

const HOUR_MS = 60 * 60 * 1000;

export const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayAndClock = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

function compass(degrees: number) {
  return COMPASS[Math.round(degrees / 45) % 8];
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {note && <span className="text-muted-foreground text-xs">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** The swell forecast and the tide at a point, whatever stands there: a buoy or a surf break. */
export function PointConditions({ latitude, longitude }: { latitude: number; longitude: number }) {
  // Rounded to the hour so the query keys stay the same between renders.
  const now = useMemo(() => new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS), []);

  const tides = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: {
        latitude,
        longitude,
        start: new Date(now.getTime() - 6 * HOUR_MS),
        end: new Date(now.getTime() + 42 * HOUR_MS),
        stepMinutes: 10,
      },
      retry: false,
    }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { latitude, longitude, start: now, end: new Date(now.getTime() + 26 * HOUR_MS) },
      retry: false,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({
      input: { latitude, longitude, days: 4 },
      retry: false,
    }),
  );

  // Every third hour of the next day, enough to read the trend at a glance.
  const nextHours = (forecast.data?.hours ?? [])
    .filter((hour) => hour.time >= now && hour.time.getUTCHours() % 3 === 0)
    .slice(0, 9);

  return (
    <>
      <Section
        title="Prévision de houle"
        note={forecast.data ? "mètres, hauteur totale des vagues" : undefined}
      >
        {forecast.isPending ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : forecast.data ? (
          <>
            <LineChart
              label="Prévision de hauteur des vagues"
              unit="m"
              marker={new Date()}
              points={forecast.data.hours.map((hour) => ({
                time: hour.time,
                value: hour.waveHeightMeters,
              }))}
            />
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 font-normal">Heure</th>
                  <th className="font-normal">Vagues</th>
                  <th className="font-normal">Houle</th>
                  <th className="font-normal">Vent</th>
                </tr>
              </thead>
              <tbody>
                {nextHours.map((hour) => (
                  <tr key={hour.time.toISOString()} className="border-t">
                    <td className="py-1">{dayAndClock.format(hour.time)}</td>
                    <td>
                      {hour.waveHeightMeters === null
                        ? "–"
                        : `${number.format(hour.waveHeightMeters)} m`}
                      {hour.wavePeriodSeconds !== null &&
                        ` · ${number.format(hour.wavePeriodSeconds)} s`}
                    </td>
                    <td>
                      {hour.swellHeightMeters === null
                        ? "–"
                        : `${number.format(hour.swellHeightMeters)} m`}
                      {hour.swellDirectionDegrees !== null &&
                        ` ${compass(hour.swellDirectionDegrees)}`}
                    </td>
                    <td>
                      {hour.windSpeedMetersPerSecond === null
                        ? "–"
                        : `${number.format(hour.windSpeedMetersPerSecond * 3.6)} km/h`}
                      {hour.windDirectionDegrees !== null &&
                        ` ${compass(hour.windDirectionDegrees)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground text-xs">{forecast.data.source.attribution}</p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">Pas de prévision pour ce point.</p>
        )}
      </Section>

      <Section
        title="Marée"
        note={
          tides.data
            ? `mètres, à ${tides.data.station.name} (${number.format(tides.data.station.distanceKm)} km)`
            : undefined
        }
      >
        {tides.isPending ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : tides.data ? (
          <>
            <LineChart
              label="Hauteur de marée"
              unit="m"
              marker={new Date()}
              points={tides.data.timeline.map((entry) => ({
                time: entry.time,
                value: entry.heightMeters,
              }))}
            />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
              {extremes.data?.extremes.map((extreme) => (
                <li key={extreme.time.toISOString()}>
                  <span className="text-muted-foreground">
                    {extreme.type === "high" ? "PM" : "BM"}
                  </span>{" "}
                  {clock.format(extreme.time)} · {number.format(extreme.heightMeters)} m
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Calculée, hauteurs au-dessus de {tides.data.datum}. Source{" "}
              {tides.data.station.source.name}.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Aucune station de marée à moins de 100 km.
          </p>
        )}
      </Section>
    </>
  );
}
