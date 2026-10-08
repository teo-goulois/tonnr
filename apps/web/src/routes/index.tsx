import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import {
  HEIGHT_SCALE,
  NO_READING_COLOR,
  StationMap,
  type MapStation,
} from "@/components/viewer/station-map";
import { StationPanel } from "@/components/viewer/station-panel";
import { orpc } from "@/utils/orpc";

// A temporary page to look at the data the API serves. It is not the product's interface.
export const Route = createFileRoute("/")({
  validateSearch: z.object({ station: z.string().optional() }),
  component: Viewer,
});

// A reading older than this is shown as missing on the map.
const FRESH_HOURS = 6;

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function Viewer() {
  const { station: selectedId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const list = useQuery(orpc.v1.stations.list.queryOptions({ input: { limit: 500 } }));

  const freshSince = Date.now() - FRESH_HOURS * 60 * 60 * 1000;
  const stations: MapStation[] = (list.data?.stations ?? []).map((station) => ({
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    significantHeightMeters:
      station.latestReading && station.latestReading.observedAt.getTime() > freshSince
        ? station.latestReading.significantHeightMeters
        : null,
  }));
  const french = stations
    .filter((station) => station.id.startsWith("candhis-"))
    .sort((a, b) => (b.significantHeightMeters ?? -1) - (a.significantHeightMeters ?? -1));

  return (
    <div className="grid min-h-0 grid-rows-[minmax(320px,45svh)_1fr] lg:grid-cols-[1fr_460px] lg:grid-rows-1">
      <div className="relative min-h-0">
        <StationMap
          stations={stations}
          selectedId={selectedId}
          onSelect={(id) => void navigate({ search: { station: id } })}
        />
        <div className="bg-background/90 absolute bottom-3 left-3 rounded-md border px-3 py-2 text-xs">
          <div className="text-muted-foreground mb-1">Hauteur significative</div>
          <div className="flex items-center gap-3">
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
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t lg:border-t-0 lg:border-l">
        {selectedId ? (
          <StationPanel key={selectedId} stationId={selectedId} />
        ) : (
          <div className="grid gap-4 p-4">
            <div>
              <h2 className="text-xl font-semibold">Bouées</h2>
              <p className="text-muted-foreground text-sm">
                {list.isPending
                  ? "Chargement…"
                  : list.isError
                    ? "L'API ne répond pas."
                    : `${stations.length} bouées. Choisis-en une sur la carte ou dans la liste.`}
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
