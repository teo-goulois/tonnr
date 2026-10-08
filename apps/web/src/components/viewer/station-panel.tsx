import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { orpc } from "@/utils/orpc";

import { LineChart } from "./line-chart";

const HOUR_MS = 60 * 60 * 1000;
const KNOTS_PER_MS = 1.943844;

function knots(metersPerSecond: number | null) {
  return metersPerSecond === null ? null : metersPerSecond * KNOTS_PER_MS;
}

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
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

function ago(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

function Tile({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-medium tabular-nums">
        {value === null ? "–" : number.format(value)}
        {value !== null && <span className="text-muted-foreground ml-1 text-xs">{unit}</span>}
      </div>
    </div>
  );
}

function Section({
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

export function StationPanel({ stationId }: { stationId: string }) {
  // Rounded to the hour so the query keys stay the same between renders.
  const now = useMemo(() => new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS), []);

  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({ input: { id: stationId, limit: 2000 } }),
  );
  const station = history.data?.station;
  const point = station && { latitude: station.latitude, longitude: station.longitude };

  const tides = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: {
        latitude: point?.latitude ?? 0,
        longitude: point?.longitude ?? 0,
        start: new Date(now.getTime() - 6 * HOUR_MS),
        end: new Date(now.getTime() + 42 * HOUR_MS),
        stepMinutes: 10,
      },
      enabled: Boolean(point),
      retry: false,
    }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: {
        latitude: point?.latitude ?? 0,
        longitude: point?.longitude ?? 0,
        start: now,
        end: new Date(now.getTime() + 26 * HOUR_MS),
      },
      enabled: Boolean(point),
      retry: false,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({
      input: { latitude: point?.latitude ?? 0, longitude: point?.longitude ?? 0, days: 4 },
      enabled: Boolean(point),
      retry: false,
    }),
  );

  if (history.isPending) return <p className="text-muted-foreground p-4 text-sm">Chargement…</p>;
  if (!station) return <p className="p-4 text-sm">Cette bouée est introuvable.</p>;

  const readings = history.data?.readings ?? [];
  const latest = readings[0];
  const measuresWaves = station.measures.includes("waves");
  const measuresWind = station.measures.includes("wind");
  const period =
    latest?.peakPeriodSeconds ??
    latest?.significantPeriodSeconds ??
    latest?.meanPeriodSeconds ??
    null;
  const periodLabel =
    latest?.peakPeriodSeconds != null
      ? "Période au pic"
      : latest?.significantPeriodSeconds != null
        ? "Période significative"
        : "Période moyenne";

  // Every third hour of the next day, enough to read the trend at a glance.
  const nextHours = (forecast.data?.hours ?? [])
    .filter((hour) => hour.time >= now && hour.time.getUTCHours() % 3 === 0)
    .slice(0, 9);

  return (
    <div className="grid gap-6 p-4">
      <header>
        <h2 className="text-xl font-semibold">{station.name}</h2>
        <p className="text-muted-foreground text-xs">
          {station.attribution} · licence {station.license.type}
        </p>
      </header>

      <Section title="Dernière mesure" note={latest && ago(latest.observedAt)}>
        {latest ? (
          <div className="grid grid-cols-3 gap-2">
            {measuresWaves && (
              <>
                <Tile
                  label="Hauteur significative"
                  value={latest.significantHeightMeters}
                  unit="m"
                />
                <Tile label="Hauteur max" value={latest.maxHeightMeters} unit="m" />
                <Tile label={periodLabel} value={period} unit="s" />
                <Tile label="Direction au pic" value={latest.peakDirectionDegrees} unit="°" />
                <Tile label="Eau" value={latest.waterTemperatureCelsius} unit="°C" />
              </>
            )}
            <Tile label="Vent" value={knots(latest.windSpeedMetersPerSecond)} unit="nd" />
            {measuresWind && (
              <>
                <Tile label="Rafales" value={knots(latest.windGustMetersPerSecond)} unit="nd" />
                <Tile label="Vent, vient du" value={latest.windDirectionDegrees} unit="°" />
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Aucune mesure sur les deux derniers jours.
          </p>
        )}
      </Section>

      {measuresWaves && (
        <Section title="Hauteur significative mesurée" note="mètres, 48 dernières heures">
          <LineChart
            label="Hauteur significative mesurée"
            unit="m"
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
        <Section title="Vent mesuré" note="nœuds, 48 dernières heures">
          <LineChart
            label="Vitesse du vent mesurée"
            unit="nd"
            points={readings
              .map((reading) => ({
                time: reading.observedAt,
                value: knots(reading.windSpeedMetersPerSecond),
              }))
              .reverse()}
          />
        </Section>
      )}

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
    </div>
  );
}
