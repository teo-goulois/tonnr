import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { LineChart } from "./line-chart";
import { number, PointConditions, Section } from "./point-conditions";

const KNOTS_PER_MS = 1.943844;

function knots(metersPerSecond: number | null) {
  return metersPerSecond === null ? null : metersPerSecond * KNOTS_PER_MS;
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

export function StationPanel({ stationId }: { stationId: string }) {
  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({ input: { id: stationId, limit: 2000 } }),
  );
  const station = history.data?.station;

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

  return (
    <div className="grid gap-6 p-4">
      <header>
        <h2 className="text-l font-medium">{station.name}</h2>
        <p className="text-muted-foreground text-xs">
          {station.attribution} · licence {station.license.type}
        </p>
        {station.exposure === "sheltered" && (
          <p className="mt-2 text-xs">
            Site abrité : les jours de mer agitée, ses vagues sont restées sous un cinquième de
            celles des stations voisines.
          </p>
        )}
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

      <PointConditions latitude={station.latitude} longitude={station.longitude} />
    </div>
  );
}
