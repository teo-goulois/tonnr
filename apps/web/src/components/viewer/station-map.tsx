import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  Marker,
} from "maplibre-gl";
// The library runs its tile work in a worker, which the bundler has to build as its own file.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState } from "react";

export type MapStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // Null when the station has no reading from the last few hours.
  significantHeightMeters: number | null;
};

export type WindStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speedKnots: number;
  // Where the wind comes from. Null when it turns too much to say.
  directionDegrees: number | null;
};

// West, south, east, north.
export type Bounds = [number, number, number, number];

type StationMapProps = {
  stations: MapStation[];
  windStations: WindStation[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: Bounds) => void;
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

// One orange, darker for light air and lighter for strong wind.
const CALM = { knots: 0, background: "#4a2412", text: "#ffffff" };
export const WIND_SCALE = [
  CALM,
  { knots: 8, background: "#8a3d1c", text: "#ffffff" },
  { knots: 15, background: "#d95926", text: "#ffffff" },
  { knots: 25, background: "#f6a67e", text: "#0b0b0b" },
];

function windColor(knots: number) {
  let color = CALM;
  for (const stop of WIND_SCALE) {
    if (knots >= stop.knots) color = stop;
  }
  return color;
}

// A badge with an arrow that points where the wind is going, and its speed in knots.
function windBadge(station: WindStation, selected: boolean, onSelect: (id: string) => void) {
  const color = windColor(station.speedKnots);
  const badge = document.createElement("button");
  badge.type = "button";
  badge.title = station.name;
  badge.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:3px",
    "padding:1px 5px",
    "border-radius:5px",
    "font:600 11px/16px system-ui,sans-serif",
    "cursor:pointer",
    `border:${selected ? "2px solid #ffffff" : "1.5px solid #1a1a19"}`,
    `background:${color.background}`,
    `color:${color.text}`,
  ].join(";");

  if (station.directionDegrees !== null) {
    const arrow = document.createElement("span");
    arrow.textContent = "↑";
    arrow.style.cssText = `display:inline-block;transform:rotate(${station.directionDegrees + 180}deg)`;
    badge.append(arrow);
  }
  badge.append(String(Math.round(station.speedKnots)));
  badge.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(station.id);
  });
  return badge;
}

// The visible area, widened to a tenth of a degree so that small moves ask for the same area.
function visibleBounds(instance: MapLibreMap): Bounds {
  const bounds = instance.getBounds();
  const wide = bounds.getEast() - bounds.getWest() >= 360;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return [
    wide ? -180 : clamp(Math.floor(bounds.getWest() * 10) / 10, 180),
    clamp(Math.floor(bounds.getSouth() * 10) / 10, 90),
    wide ? 180 : clamp(Math.ceil(bounds.getEast() * 10) / 10, 180),
    clamp(Math.ceil(bounds.getNorth() * 10) / 10, 90),
  ];
}

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

export function StationMap({
  stations,
  windStations,
  selectedId,
  onSelect,
  onBoundsChange,
}: StationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const library = useRef<typeof import("maplibre-gl") | null>(null);
  const windMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  // The map is created once, so its handlers read the latest props through refs.
  const latest = useRef({ stations, selectedId, onSelect, onBoundsChange });
  latest.current = { stations, selectedId, onSelect, onBoundsChange };

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

        instance.on("moveend", () => latest.current.onBoundsChange(visibleBounds(instance)));
        latest.current.onBoundsChange(visibleBounds(instance));

        map.current = instance;
        library.current = maplibre;
        setReady(true);
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
  }, [stations, ready]);

  useEffect(() => {
    const instance = map.current;
    const maplibre = library.current;
    if (!instance || !maplibre) return;

    windMarkers.current = windStations.map((station) =>
      new maplibre.Marker({
        element: windBadge(station, station.id === selectedId, (id) => latest.current.onSelect(id)),
        // Above the point, so a buoy that also measures the wind keeps its dot visible.
        anchor: "bottom",
        offset: [0, -8],
      })
        .setLngLat([station.longitude, station.latitude])
        .addTo(instance),
    );

    return () => {
      for (const marker of windMarkers.current) marker.remove();
      windMarkers.current = [];
    };
  }, [windStations, selectedId, ready]);

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
  }, [selectedId, ready]);

  return <div ref={container} className="h-full min-h-[320px] w-full" />;
}
