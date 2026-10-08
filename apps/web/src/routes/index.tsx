import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  HEIGHT_SCALE,
  NO_READING_COLOR,
  StationMap,
  WIND_SCALE,
  type Bounds,
  type MapStation,
  type WindStation,
} from "@/components/viewer/station-map";
import { StationPanel } from "@/components/viewer/station-panel";
import { orpc } from "@/utils/orpc";

// A temporary page to look at the data the API serves. It is not the product's interface.
export const Route = createFileRoute("/")({
  validateSearch: z.object({ station: z.string().optional() }),
  component: Viewer,
});

const HOUR_MS = 60 * 60 * 1000;
// A reading older than this is shown as missing on the map.
const FRESH_WAVES_MS = 6 * HOUR_MS;
const FRESH_WIND_MS = 2 * HOUR_MS;
const KNOTS_PER_MS = 1.943844;
const WIND_LIMIT = 500;

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const MINUTE_MS = 60 * 1000;

// The current time, updated every minute, so that a reading ages out while the page stays open.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Viewer() {
  const { station: selectedId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [showWind, setShowWind] = useState(true);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  const waves = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "waves", limit: 500 },
      refetchInterval: 10 * MINUTE_MS,
    }),
  );
  // Wind stations are many, so only the ones in view are loaded.
  const wind = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "wind", bbox: bounds?.join(",") ?? "", limit: WIND_LIMIT },
      enabled: showWind && bounds !== null,
      placeholderData: keepPreviousData,
      // The worker fetches the wind every ten minutes.
      refetchInterval: 5 * MINUTE_MS,
    }),
  );

  const now = useNow();
  const stations: MapStation[] = (waves.data?.stations ?? []).map((station) => ({
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    significantHeightMeters:
      station.latestReading && now - station.latestReading.observedAt.getTime() < FRESH_WAVES_MS
        ? station.latestReading.significantHeightMeters
        : null,
    isSheltered: station.exposure === "sheltered",
  }));
  const windStations: WindStation[] = (showWind ? (wind.data?.stations ?? []) : []).flatMap(
    (station) => {
      const reading = station.latestReading;
      const speed = reading?.windSpeedMetersPerSecond;
      if (!reading || speed == null || now - reading.observedAt.getTime() > FRESH_WIND_MS)
        return [];
      return [
        {
          id: station.id,
          name: station.name,
          latitude: station.latitude,
          longitude: station.longitude,
          speedKnots: speed * KNOTS_PER_MS,
          directionDegrees: reading.windDirectionDegrees,
        },
      ];
    },
  );
  const french = stations
    .filter((station) => station.id.startsWith("candhis-"))
    .sort((a, b) => (b.significantHeightMeters ?? -1) - (a.significantHeightMeters ?? -1));

  return (
    <div className="grid min-h-0 grid-rows-[minmax(320px,45svh)_1fr] lg:grid-cols-[1fr_460px] lg:grid-rows-1">
      <div className="relative min-h-0">
        <StationMap
          stations={stations}
          windStations={windStations}
          selectedId={selectedId}
          onSelect={(id) => void navigate({ search: { station: id } })}
          onBoundsChange={setBounds}
        />
        <div className="bg-background/90 absolute bottom-3 left-3 grid gap-2 rounded-md border px-3 py-2 text-xs">
          <div>
            <div className="text-muted-foreground mb-1">Vagues, hauteur significative</div>
            <div className="flex flex-wrap items-center gap-3">
              {HEIGHT_SCALE.map((stop) => (
                <span key={stop.meters} className="flex items-center gap-1">
                  <span className="size-2.5 rounded-full" style={{ background: stop.color }} />
                  {number.format(stop.meters)} m
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: NO_READING_COLOR }} />
                sans mesure récente
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-white/40" />
                site abrité (port, estuaire)
              </span>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showWind}
                onChange={(event) => setShowWind(event.target.checked)}
              />
              Vent, en nœuds (la flèche indique où il va)
            </label>
            {showWind && (
              <div className="flex flex-wrap items-center gap-3">
                {WIND_SCALE.map((stop) => (
                  <span key={stop.knots} className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm" style={{ background: stop.background }} />
                    {stop.knots}+
                  </span>
                ))}
                {wind.data?.stations.length === WIND_LIMIT && (
                  <span className="text-muted-foreground">zoome pour tout voir</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t lg:border-t-0 lg:border-l">
        {selectedId ? (
          <StationPanel key={selectedId} stationId={selectedId} />
        ) : (
          <div className="grid gap-4 p-4">
            <div>
              <h2 className="text-xl font-semibold">Bouées et stations de vent</h2>
              <p className="text-muted-foreground text-sm">
                {waves.isPending
                  ? "Chargement…"
                  : waves.isError
                    ? "L'API ne répond pas."
                    : `${stations.length} bouées, ${windStations.length} stations de vent dans la vue. Choisis-en une sur la carte ou dans la liste.`}
              </p>
            </div>
            <ul className="grid gap-1">
              {french.map((station) => (
                <li key={station.id}>
                  <Link
                    to="/"
                    search={{ station: station.id }}
                    className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                  >
                    <span>{station.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {station.significantHeightMeters === null
                        ? "–"
                        : `${number.format(station.significantHeightMeters)} m`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
