import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
// The library runs its tile work in a worker, which the bundler has to build as its own file.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";

export type MapStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // Null when the station has no reading from the last few hours.
  significantHeightMeters: number | null;
};

type StationMapProps = {
  stations: MapStation[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
};

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
// France and its Atlantic coast.
const INITIAL_VIEW = { center: [-2.5, 46.3] as [number, number], zoom: 4.8 };

// One blue, darker for calm and lighter for big seas, since the map is dark.
export const HEIGHT_SCALE = [
  { meters: 0, color: "#184f95" },
  { meters: 1.5, color: "#3987e5" },
  { meters: 3, color: "#86b6ef" },
  { meters: 5, color: "#cde2fb" },
];
export const NO_READING_COLOR = "#898781";

// A paint value that differs for the selected station.
function whenSelected<T extends number | string>(
  selectedId: string | undefined,
  selected: T,
  other: T,
): ExpressionSpecification {
  return ["case", ["==", ["get", "id"], selectedId ?? ""], selected, other];
}

function toGeoJson(stations: MapStation[]) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [station.longitude, station.latitude] },
      properties: {
        id: station.id,
        name: station.name,
        height: station.significantHeightMeters ?? -1,
      },
    })),
  };
}

export function StationMap({ stations, selectedId, onSelect }: StationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // The map is created once, so its handlers read the latest props through refs.
  const latest = useRef({ stations, selectedId, onSelect });
  latest.current = { stations, selectedId, onSelect };

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;

    // maplibre-gl needs a browser, so it is loaded after the page reaches one.
    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;

      maplibre.setWorkerUrl(workerUrl);
      const instance = new maplibre.Map({
        container: container.current,
        style: STYLE_URL,
        ...INITIAL_VIEW,
        attributionControl: { compact: true },
      });
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      created = instance;

      instance.on("load", () => {
        instance.addSource("stations", {
          type: "geojson",
          data: toGeoJson(latest.current.stations),
        });
        instance.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-radius": whenSelected(latest.current.selectedId, 10, 6),
            "circle-color": [
              "case",
              ["<", ["get", "height"], 0],
              NO_READING_COLOR,
              [
                "interpolate",
                ["linear"],
                ["get", "height"],
                ...HEIGHT_SCALE.flatMap((stop) => [stop.meters, stop.color]),
              ],
            ],
            "circle-stroke-width": whenSelected(latest.current.selectedId, 3, 1.5),
            "circle-stroke-color": whenSelected(latest.current.selectedId, "#ffffff", "#1a1a19"),
          },
        });

        instance.on("click", "stations", (event: MapLayerMouseEvent) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") latest.current.onSelect(id);
        });
        instance.on("mouseenter", "stations", () => {
          instance.getCanvas().style.cursor = "pointer";
        });
        instance.on("mouseleave", "stations", () => {
          instance.getCanvas().style.cursor = "";
        });

        map.current = instance;
      });
    });

    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const source = map.current?.getSource<GeoJSONSource>("stations");
    source?.setData(toGeoJson(stations));
  }, [stations]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getLayer("stations")) return;

    instance.setPaintProperty("stations", "circle-radius", whenSelected(selectedId, 10, 6));
    instance.setPaintProperty("stations", "circle-stroke-width", whenSelected(selectedId, 3, 1.5));
    instance.setPaintProperty(
      "stations",
      "circle-stroke-color",
      whenSelected(selectedId, "#ffffff", "#1a1a19"),
    );
  }, [selectedId]);

  return <div ref={container} className="h-full min-h-[320px] w-full" />;
}
