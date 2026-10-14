import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";

// What a GeoJSON source takes, as MapLibre names it.
type Collection = Parameters<GeoJSONSource["setData"]>[0];
// The library runs its tile work in a worker, which the bundler has to build as its own file.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapBreak } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

// The basemap the web app draws, without its sea: what matters here is where a break stands.
const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// The Atlantic coasts of Europe, where the catalogue is thickest.
const DEFAULT_VIEW = { center: [-4, 44] as [number, number], zoom: 4.2 };
// A break is pressed within this many pixels of its dot.
const REACH = 10;
const SOURCE = "breaks";

export type MapPoint = { latitude: number; longitude: number };

type CatalogueMapProps = {
  breaks: MapBreak[];
  // The break in view, drawn larger.
  selectedId?: string | undefined;
  // Breaks that matter to what is decided, such as the one a candidate may be merged into.
  markedIds?: string[];
  // A point being placed: a marker that the operator drags, or moves with a press on the map.
  marker?: MapPoint | null;
  onMarkerMove?: (point: MapPoint) => void;
  onSelect: (id: string) => void;
  // Where to look. The map goes there each time `focus.key` changes.
  focus?: { key: string; point: MapPoint; zoom?: number } | null;
  className?: string;
};

// The theme's colors, read where the theme defines them: a layer of the map is not CSS.
function themeColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000000";
}

// A dot's radius at a zoom: larger for the break in view and for the ones that matter.
const radius = (base: number): ExpressionSpecification => [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  base + 5,
  ["boolean", ["feature-state", "marked"], false],
  base + 3,
  base,
];

function collection(breaks: MapBreak[]): Collection {
  return {
    type: "FeatureCollection",
    features: breaks.map((found) => ({
      type: "Feature",
      id: found.id,
      geometry: { type: "Point", coordinates: [found.longitude, found.latitude] },
      properties: { id: found.id, name: found.name, known: found.known },
    })),
  };
}

/**
 * Every break of the catalogue on a map, for its operator: a press selects one, and a marker
 * shows a point that is being placed, which a drag or a press moves.
 */
export function CatalogueMap({
  breaks,
  selectedId,
  markedIds = [],
  marker,
  onMarkerMove,
  onSelect,
  focus,
  className,
}: CatalogueMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pin = useRef<MapLibreMarker | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const latest = useRef({ onSelect, onMarkerMove });
  latest.current = { onSelect, onMarkerMove };
  const data = useMemo(() => collection(breaks), [breaks]);

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;
    // maplibre-gl needs a browser, so it is loaded after the page reaches one.
    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl(workerUrl);
      const instance = new maplibre.Map({
        container: container.current,
        style: STYLE_URLS[theme],
        ...DEFAULT_VIEW,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      created = instance;
      instance.on("style.load", () => {
        map.current = instance;
        setStyleVersion((version) => version + 1);
      });

      instance.on("click", (event) => {
        const box: [[number, number], [number, number]] = [
          [event.point.x - REACH, event.point.y - REACH],
          [event.point.x + REACH, event.point.y + REACH],
        ];
        const hit = instance.getLayer("breaks")
          ? instance.queryRenderedFeatures(box, { layers: ["breaks"] })[0]
          : undefined;
        const id = hit?.properties?.id;
        if (typeof id === "string") latest.current.onSelect(id);
        else if (latest.current.onMarkerMove) {
          latest.current.onMarkerMove({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
        }
      });
      instance.on("mousemove", (event) => {
        const hit = instance.getLayer("breaks")
          ? instance.queryRenderedFeatures(
              [
                [event.point.x - REACH, event.point.y - REACH],
                [event.point.x + REACH, event.point.y + REACH],
              ],
              { layers: ["breaks"] },
            )
          : [];
        instance.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
      });
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
      pin.current = null;
    };
    // The map is made once. A theme that changes changes its style below.
  }, []);

  // A new theme takes a new style, which drops the layers: they go back once it is loaded.
  const shownTheme = useRef(theme);
  useEffect(() => {
    if (!map.current || shownTheme.current === theme) return;
    shownTheme.current = theme;
    map.current.setStyle(STYLE_URLS[theme]);
  }, [theme]);

  // The breaks, as dots, and their names once the map is close enough to read them.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0) return;
    const source = instance.getSource<GeoJSONSource>(SOURCE);
    if (source) {
      source.setData(data);
      return;
    }
    instance.addSource(SOURCE, { type: "geojson", data, promoteId: "id" });
    const ink = themeColor("--color-1");
    const paper = themeColor("--neutral-1");
    instance.addLayer({
      id: "breaks",
      type: "circle",
      source: SOURCE,
      paint: {
        // The zoom comes first, as MapLibre asks: a break in view is drawn larger at every zoom.
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          radius(2.5),
          10,
          radius(4.5),
          14,
          radius(6),
        ],
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          ink,
          ["boolean", ["feature-state", "marked"], false],
          themeColor("--success"),
          ["get", "known"],
          ink,
          themeColor("--neutral-6"),
        ],
        "circle-stroke-color": paper,
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          3,
          ["boolean", ["feature-state", "marked"], false],
          2,
          1,
        ],
      },
    });
    instance.addLayer({
      id: "break-names",
      type: "symbol",
      source: SOURCE,
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": themeColor("--neutral-9"),
        "text-halo-color": paper,
        "text-halo-width": 1.5,
      },
    });
  }, [data, styleVersion]);

  // The break in view and the ones that matter, drawn apart from the others.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0 || !instance.getSource(SOURCE)) return;
    const states = [
      ...(selectedId ? [{ id: selectedId, state: { selected: true } }] : []),
      ...markedIds.map((id) => ({ id, state: { marked: true } })),
    ];
    for (const { id, state } of states) instance.setFeatureState({ source: SOURCE, id }, state);
    return () => {
      if (!instance.getSource(SOURCE)) return;
      for (const { id } of states) instance.removeFeatureState({ source: SOURCE, id });
    };
  }, [selectedId, markedIds.join(","), styleVersion, data]);

  // The point being placed.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0) return;
    if (!marker) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (pin.current) {
      pin.current.setLngLat([marker.longitude, marker.latitude]);
      pin.current.setDraggable(Boolean(onMarkerMove));
      return;
    }
    void import("maplibre-gl").then((maplibre) => {
      if (map.current !== instance || pin.current) return;
      const made = new maplibre.Marker({
        color: themeColor("--warning"),
        draggable: Boolean(latest.current.onMarkerMove),
      })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(instance);
      made.getElement().setAttribute("aria-label", m.catalogue_marker());
      made.on("dragend", () => {
        const { lat, lng } = made.getLngLat();
        latest.current.onMarkerMove?.({ latitude: lat, longitude: lng });
      });
      pin.current = made;
    });
  }, [marker?.latitude, marker?.longitude, Boolean(onMarkerMove), styleVersion]);

  // Where to look.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0 || !focus) return;
    instance.jumpTo({
      center: [focus.point.longitude, focus.point.latitude],
      zoom: Math.max(instance.getZoom(), focus.zoom ?? 13),
    });
  }, [focus?.key, styleVersion]);

  return (
    <div
      ref={container}
      className={className ?? "h-full min-h-80 w-full overflow-hidden rounded-m"}
      role="region"
      aria-label={m.catalogue_map()}
    />
  );
}
