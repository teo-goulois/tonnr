import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  PaddingOptions,
  RasterTileSource,
} from "maplibre-gl";
// The library runs its tile work in a worker, which the bundler has to build as its own file.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@repo/ui/lib/utils";

import type { Freshness } from "@/lib/format";
import {
  NO_READING_COLOR,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  seaColorTable,
} from "@/lib/sea-scales";

import { BuoyPill, UserDot, WindBadge } from "./map-markers";

export type MapStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // Null when the station has no reading from the last few hours.
  heightMeters: number | null;
  periodSeconds: number | null;
  // Where the waves come from. Null when the buoy does not say.
  directionDegrees: number | null;
  freshness: Freshness;
  // A site in a harbour or an estuary, whose waves say nothing of the sea outside.
  isSheltered: boolean;
  isSaved: boolean;
  // What a screen reader says for the station's marker.
  label: string;
};

export type WindStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speedKnots: number;
  // Where the wind comes from. Null when it turns too much to say.
  directionDegrees: number | null;
  label: string;
};

/** Map tiles of the wave height, as the API describes them. */
export type SeaLayer = {
  // {z}, {x} and {y} are placeholders, and {time} takes an instant in ISO 8601.
  tileUrlTemplate: string;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  // A pixel says a height by its gray level: the height each of the 256 levels stands for.
  encoding: { metersByLevel: readonly number[] };
  source: { attribution: string };
};

/** A surf break of the catalogue. It measures nothing: it is a place, with a name. */
export type MapBreak = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type MapLayers = { sea: boolean; buoys: boolean; wind: boolean; breaks: boolean };

// West, south, east, north.
export type Bounds = [number, number, number, number];

export type MapPoint = { latitude: number; longitude: number };

export type StationMapHandle = {
  /** Brings a point to the middle of the part of the map that no drawer covers. */
  focus: (point: MapPoint, minZoom?: number) => void;
  zoomBy: (steps: number) => void;
};

type StationMapProps = {
  ref?: Ref<StationMapHandle>;
  stations: MapStation[];
  windStations: WindStation[];
  breaks: MapBreak[];
  // The id of the selected station, or of the selected break.
  selectedId: string | undefined;
  layers: MapLayers;
  seaLayer: SeaLayer | undefined;
  // The instant the sea is shown at.
  seaTime: Date | undefined;
  theme: "light" | "dark";
  // The part of the map a drawer covers. The selected station is shown beside it, not under it.
  padding: Required<PaddingOptions>;
  userLocation: MapPoint | null;
  userLocationLabel: string;
  onSelect: (id: string) => void;
  onSelectBreak: (id: string) => void;
  onBoundsChange: (bounds: Bounds) => void;
};

const STYLE_URLS = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
// France and its Atlantic coast.
const DEFAULT_VIEW = { center: [-2.5, 46.3] as [number, number], zoom: 4.8 };
const VIEW_STORAGE_KEY = "tonnr:map-view";
// Sea tiles go through this protocol, which gives each gray level its color.
const SEA_PROTOCOL = "seatile";
// More markers than this hide the map, and the dots under them still say where the stations are.
const MAX_MARKERS = 140;
const BUOY_BOX = { width: 104, height: 32 };
const WIND_BOX = { width: 50, height: 26 };
// A wind badge sits above its point, so a buoy that also measures the wind keeps both.
const WIND_LIFT = 24;
// The layers a click can land on, the topmost first.
const DOT_LAYERS = ["break-dots", "station-dots", "wind-dots"];
// A station this close to the edge of what is visible is brought back to the middle.
const REVEAL_MARGIN = 56;

// Where the middle of the visible part is, from the middle of the whole map.
function visibleCenterOffset(padding: Required<PaddingOptions>): [number, number] {
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
}

let seaColors: Uint8ClampedArray | null = null;
let seaProtocolAdded = false;

function addSeaProtocol(maplibre: typeof import("maplibre-gl")) {
  if (seaProtocolAdded) return;
  seaProtocolAdded = true;

  maplibre.addProtocol(SEA_PROTOCOL, async (request, abortController) => {
    const response = await fetch(request.url.replace(`${SEA_PROTOCOL}:`, "https:"), {
      signal: abortController.signal,
    });
    if (!response.ok) throw new Error(`The sea tile answered ${response.status}`);

    const tile = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(tile.width, tile.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !seaColors) return { data: tile };

    context.drawImage(tile, 0, 0);
    const image = context.getImageData(0, 0, tile.width, tile.height);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      // Land is transparent in the tile, and stays so.
      if (pixels[index + 3] === 0) continue;
      const color = pixels[index]! * 4;
      pixels[index] = seaColors[color]!;
      pixels[index + 1] = seaColors[color + 1]!;
      pixels[index + 2] = seaColors[color + 2]!;
      pixels[index + 3] = seaColors[color + 3]!;
    }
    context.putImageData(image, 0, 0);
    return { data: canvas.transferToImageBitmap() };
  });
}

function seaTiles(layer: SeaLayer, time: Date) {
  return [
    layer.tileUrlTemplate
      .replace("{time}", encodeURIComponent(time.toISOString()))
      .replace(/^https:/, `${SEA_PROTOCOL}:`),
  ];
}

function readSavedView() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) ?? "null");
    if (
      Array.isArray(saved) &&
      saved.length === 3 &&
      saved.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      const [longitude, latitude, zoom] = saved as [number, number, number];
      return { center: [longitude, latitude] as [number, number], zoom };
    }
  } catch {
    // A value this app did not write, or a browser that keeps nothing: the default view applies.
  }
  return DEFAULT_VIEW;
}

// A longitude brought back between -180 and 180, since the map can be dragged past either edge.
function wrapLongitude(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

// The visible area, widened to a tenth of a degree so that small moves ask for the same area.
// West can be greater than east: the area then crosses the antimeridian.
function visibleBounds(instance: MapLibreMap): Bounds {
  const bounds = instance.getBounds();
  const west = Math.floor(bounds.getWest() * 10) / 10;
  const east = Math.ceil(bounds.getEast() * 10) / 10;
  const wide = east - west >= 360;
  const clampLatitude = (value: number) => Math.max(-90, Math.min(90, value));
  return [
    wide ? -180 : wrapLongitude(west),
    clampLatitude(Math.floor(bounds.getSouth() * 10) / 10),
    wide ? 180 : wrapLongitude(east),
    clampLatitude(Math.ceil(bounds.getNorth() * 10) / 10),
  ];
}

function scaleExpression(
  property: string,
  scale: { value: number; color: string }[],
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["get", property],
    ...scale.flatMap((stop) => [stop.value, stop.color]),
  ] as ExpressionSpecification;
}

function stationFeatures(stations: MapStation[]) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [station.longitude, station.latitude] },
      properties: {
        id: station.id,
        height: station.heightMeters ?? -1,
        sheltered: station.isSheltered,
      },
    })),
  };
}

function breakFeatures(breaks: MapBreak[]) {
  return {
    type: "FeatureCollection" as const,
    features: breaks.map((found) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [found.longitude, found.latitude] },
      properties: { id: found.id, name: found.name },
    })),
  };
}

function windFeatures(stations: WindStation[]) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [station.longitude, station.latitude] },
      properties: { id: station.id, speed: station.speedKnots },
    })),
  };
}

// The theme's surface and ink, read where they are defined, for what the map draws itself.
function themeColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888";
}

type Marker = { key: string; kind: "buoy" | "wind"; id: string };

function sameMarkers(previous: Marker[], next: Marker[]) {
  return (
    previous.length === next.length &&
    previous.every((marker, index) => marker.key === next[index]!.key)
  );
}

type Box = { left: number; top: number; right: number; bottom: number };

function overlaps(box: Box, others: Box[]) {
  return others.some(
    (other) =>
      box.left < other.right &&
      box.right > other.left &&
      box.top < other.bottom &&
      box.bottom > other.top,
  );
}

export function StationMap({
  ref,
  stations,
  windStations,
  breaks,
  selectedId,
  layers,
  seaLayer,
  seaTime,
  theme,
  padding,
  userLocation,
  userLocationLabel,
  onSelect,
  onSelectBreak,
  onBoundsChange,
}: StationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // Counts the styles loaded so far. A new style drops every source and layer added to the last.
  const [styleVersion, setStyleVersion] = useState(0);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const loadedTheme = useRef(theme);
  // A press that moved the map is not a press on the marker it started on.
  const dragged = useRef(false);

  // The biggest seas get their marker first. The selected station and the saved ones always do.
  const rankedStations = useMemo(() => {
    const rank = (station: MapStation) =>
      (station.id === selectedId ? 1000 : 0) +
      (station.isSaved ? 100 : 0) +
      (station.isSheltered ? -50 : 0) +
      (station.heightMeters ?? -1);
    return stations
      .filter((station) => station.heightMeters !== null)
      .sort((a, b) => rank(b) - rank(a));
  }, [stations, selectedId]);

  // The map is created once, so its handlers read the latest props through a ref.
  const latest = useRef({
    stations,
    rankedStations,
    windStations,
    selectedId,
    layers,
    padding,
    userLocation,
    onSelect,
    onSelectBreak,
    onBoundsChange,
  });
  latest.current = {
    stations,
    rankedStations,
    windStations,
    selectedId,
    layers,
    padding,
    userLocation,
    onSelect,
    onSelectBreak,
    onBoundsChange,
  };

  // Chooses the markers that fit without covering one another, and moves each to its point.
  const layout = useCallback(() => {
    const instance = map.current;
    const element = container.current;
    if (!instance || !element) return;

    const { rankedStations, windStations, selectedId, layers, userLocation } = latest.current;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const taken: Box[] = [];
    const next: Marker[] = [];
    positions.current.clear();

    const place = (
      marker: Marker,
      longitude: number,
      latitude: number,
      box: { width: number; height: number },
      lift: number,
      always: boolean,
    ) => {
      if (next.length >= MAX_MARKERS && !always) return;
      const point = instance.project([longitude, latitude]);
      const x = Math.round(point.x);
      const y = Math.round(point.y) - lift;
      const bounds = {
        left: x - box.width / 2,
        right: x + box.width / 2,
        top: y - box.height / 2,
        bottom: y + box.height / 2,
      };
      if (bounds.right < 0 || bounds.left > width || bounds.bottom < 0 || bounds.top > height)
        return;
      if (!always && overlaps(bounds, taken)) return;
      taken.push(bounds);
      next.push(marker);
      positions.current.set(marker.key, { x, y });
    };

    if (layers.buoys) {
      for (const station of rankedStations) {
        place(
          { key: `buoy:${station.id}`, kind: "buoy", id: station.id },
          station.longitude,
          station.latitude,
          BUOY_BOX,
          0,
          station.id === selectedId,
        );
      }
    }
    if (layers.wind) {
      for (const station of windStations) {
        place(
          { key: `wind:${station.id}`, kind: "wind", id: station.id },
          station.longitude,
          station.latitude,
          WIND_BOX,
          WIND_LIFT,
          false,
        );
      }
    }
    if (userLocation) {
      const point = instance.project([userLocation.longitude, userLocation.latitude]);
      positions.current.set("user", { x: Math.round(point.x), y: Math.round(point.y) });
    }

    for (const [key, position] of positions.current) {
      const node = nodes.current.get(key);
      if (node) node.style.translate = `${position.x}px ${position.y}px`;
    }
    setMarkers((previous) => (sameMarkers(previous, next) ? previous : next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;

    // maplibre-gl needs a browser, so it is loaded after the page reaches one.
    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !container.current) return;

      maplibre.setWorkerUrl(workerUrl);
      addSeaProtocol(maplibre);
      const instance = new maplibre.Map({
        container: container.current,
        style: STYLE_URLS[loadedTheme.current],
        ...readSavedView(),
        attributionControl: { compact: true },
        // North stays up, so an arrow drawn on the page points the right way on the map.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
      created = instance;

      // Markers live inside the map's own container, so a drag or a pinch that starts on one
      // still moves the map.
      const markerLayer = document.createElement("div");
      markerLayer.className = "pointer-events-none absolute inset-0 overflow-hidden";
      instance.getCanvasContainer().append(markerLayer);

      instance.on("style.load", () => {
        map.current = instance;
        setOverlay(markerLayer);
        setStyleVersion((version) => version + 1);
      });

      // One click selects one thing: whatever is drawn on top under the pointer.
      instance.on("click", (event: MapMouseEvent) => {
        const [hit] = instance.queryRenderedFeatures(event.point, {
          layers: DOT_LAYERS.filter((layer) => instance.getLayer(layer)),
        });
        const id = hit?.properties?.id;
        if (typeof id !== "string") return;
        if (hit?.layer.id === "break-dots") latest.current.onSelectBreak(id);
        else latest.current.onSelect(id);
      });
      for (const layer of DOT_LAYERS) {
        instance.on("mouseenter", layer, () => {
          instance.getCanvas().style.cursor = "pointer";
        });
        instance.on("mouseleave", layer, () => {
          instance.getCanvas().style.cursor = "";
        });
      }

      instance.on("dragstart", () => {
        dragged.current = true;
      });
      instance.on("move", layout);
      instance.on("moveend", () => {
        latest.current.onBoundsChange(visibleBounds(instance));
        const center = instance.getCenter();
        try {
          localStorage.setItem(
            VIEW_STORAGE_KEY,
            JSON.stringify([center.lng, center.lat, instance.getZoom()]),
          );
        } catch {
          // A browser that keeps nothing: the next visit starts from the default view.
        }
      });
      instance.once("load", () => latest.current.onBoundsChange(visibleBounds(instance)));
    });

    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
    };
  }, [layout]);

  useEffect(() => {
    if (loadedTheme.current === theme) return;
    loadedTheme.current = theme;
    map.current?.setStyle(STYLE_URLS[theme]);
  }, [theme]);

  // The sources and layers of the stations. They go back on each new style.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0 || instance.getSource("stations")) return;

    const surface = themeColor("--neutral-1");
    const ink = themeColor("--neutral-10");
    instance.addSource("stations", { type: "geojson", data: stationFeatures([]) });
    instance.addSource("wind", { type: "geojson", data: windFeatures([]) });
    instance.addSource("breaks", { type: "geojson", data: breakFeatures([]) });
    instance.addLayer({
      id: "wind-dots",
      type: "circle",
      source: "wind",
      paint: {
        "circle-radius": 3,
        "circle-color": scaleExpression("speed", WIND_SPEED_SCALE),
        "circle-stroke-width": 1,
        "circle-stroke-color": surface,
      },
    });
    instance.addLayer({
      id: "station-dots",
      type: "circle",
      source: "stations",
      paint: {
        // A sheltered site stays on the map, small and faded, so it is not read as the sea outside.
        "circle-radius": ["case", ["get", "sheltered"], 3.5, 5.5],
        "circle-opacity": ["case", ["get", "sheltered"], 0.5, 1],
        "circle-color": [
          "case",
          ["<", ["get", "height"], 0],
          NO_READING_COLOR,
          scaleExpression("height", WAVE_HEIGHT_SCALE),
        ],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": surface,
      },
    });
    instance.addLayer({
      id: "station-selected",
      type: "circle",
      source: "stations",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": 10,
        "circle-opacity": 0,
        "circle-stroke-width": 2,
        "circle-stroke-color": ink,
      },
    });
    // A break measures nothing, so it takes no color of a scale: a small dot in the theme's ink,
    // above the stations. Where a break and a buoy overlap, the buoy shows as a ring around it.
    instance.addLayer({
      id: "break-dots",
      type: "circle",
      source: "breaks",
      paint: {
        "circle-radius": 3.5,
        "circle-color": ink,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": surface,
      },
    });
    instance.addLayer({
      id: "break-selected",
      type: "circle",
      source: "breaks",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": 8,
        "circle-opacity": 0,
        "circle-stroke-width": 2,
        "circle-stroke-color": ink,
      },
    });
    // Names come in once the map is close enough for them not to run into one another.
    instance.addLayer({
      id: "break-names",
      type: "symbol",
      source: "breaks",
      minzoom: 8,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.7],
        "text-max-width": 9,
      },
      paint: {
        "text-color": ink,
        "text-halo-color": surface,
        "text-halo-width": 1.5,
      },
    });
  }, [styleVersion]);

  useEffect(() => {
    map.current?.getSource<GeoJSONSource>("stations")?.setData(stationFeatures(stations));
    layout();
  }, [stations, rankedStations, styleVersion, layout]);

  useEffect(() => {
    map.current?.getSource<GeoJSONSource>("wind")?.setData(windFeatures(windStations));
    layout();
  }, [windStations, styleVersion, layout]);

  useEffect(() => {
    map.current?.getSource<GeoJSONSource>("breaks")?.setData(breakFeatures(breaks));
  }, [breaks, styleVersion]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getLayer("station-dots")) return;
    instance.setLayoutProperty("station-dots", "visibility", layers.buoys ? "visible" : "none");
    instance.setLayoutProperty("station-selected", "visibility", layers.buoys ? "visible" : "none");
    instance.setLayoutProperty("wind-dots", "visibility", layers.wind ? "visible" : "none");
    for (const layer of ["break-dots", "break-selected", "break-names"]) {
      instance.setLayoutProperty(layer, "visibility", layers.breaks ? "visible" : "none");
    }
    layout();
  }, [layers.buoys, layers.wind, layers.breaks, styleVersion, layout]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getLayer("station-selected")) return;
    instance.setFilter("station-selected", ["==", ["get", "id"], selectedId ?? ""]);
    instance.setFilter("break-selected", ["==", ["get", "id"], selectedId ?? ""]);
    layout();
  }, [selectedId, styleVersion, layout]);

  // The sea, colored by its wave height, under the names and the roads.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0) return;

    if (!layers.sea || !seaLayer || !seaTime) {
      if (instance.getLayer("sea")) instance.removeLayer("sea");
      if (instance.getSource("sea")) instance.removeSource("sea");
      return;
    }

    seaColors = seaColorTable(seaLayer.encoding.metersByLevel);
    const tiles = seaTiles(seaLayer, seaTime);
    const source = instance.getSource<RasterTileSource>("sea");
    if (source) {
      source.setTiles(tiles);
      return;
    }

    instance.addSource("sea", {
      type: "raster",
      tiles,
      tileSize: seaLayer.tileSize,
      minzoom: seaLayer.minZoom,
      maxzoom: seaLayer.maxZoom,
      attribution: seaLayer.source.attribution,
    });
    const styleLayers = instance.getStyle().layers;
    const above = styleLayers[styleLayers.findIndex((layer) => layer.id === "water") + 1]?.id;
    instance.addLayer(
      {
        id: "sea",
        type: "raster",
        source: "sea",
        paint: {
          "raster-resampling": "linear",
          "raster-fade-duration": 200,
          // The model's cells are about nine kilometres wide. Close up they say less than they
          // seem to, so the sea fades and lets the coast show.
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8, 1, 11, 0.35],
        },
      },
      above,
    );
  }, [layers.sea, seaLayer, seaTime, styleVersion]);

  // The selected station comes into view when it is off the map or under a drawer. One that is
  // already visible stays where it is: the map does not move under the finger that pressed it.
  const revealed = useRef<string | undefined>(undefined);
  useEffect(() => {
    const instance = map.current;
    if (!selectedId) revealed.current = undefined;
    if (!instance || !selectedId || revealed.current === selectedId) return;

    const station =
      stations.find((candidate) => candidate.id === selectedId) ??
      windStations.find((candidate) => candidate.id === selectedId) ??
      breaks.find((candidate) => candidate.id === selectedId);
    if (!station) return;
    revealed.current = selectedId;

    const point = instance.project([station.longitude, station.latitude]);
    const element = instance.getContainer();
    const isVisible =
      point.x > padding.left + REVEAL_MARGIN &&
      point.x < element.clientWidth - padding.right - REVEAL_MARGIN &&
      point.y > padding.top + REVEAL_MARGIN &&
      point.y < element.clientHeight - padding.bottom - REVEAL_MARGIN;
    if (isVisible) return;

    instance.easeTo({
      center: [station.longitude, station.latitude],
      offset: visibleCenterOffset(padding),
      duration: 500,
    });
  }, [selectedId, stations, windStations, breaks, padding, styleVersion]);

  useEffect(layout, [userLocation, layout]);

  // A marker that has just been drawn takes its place before the browser paints it.
  useLayoutEffect(() => {
    for (const [key, position] of positions.current) {
      const node = nodes.current.get(key);
      if (node) node.style.translate = `${position.x}px ${position.y}px`;
    }
  }, [markers, userLocation]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (point, minZoom) => {
        const instance = map.current;
        if (!instance) return;
        instance.easeTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(instance.getZoom(), minZoom ?? 0),
          offset: visibleCenterOffset(latest.current.padding),
          duration: 600,
        });
      },
      zoomBy: (steps) =>
        map.current?.easeTo({ zoom: map.current.getZoom() + steps, duration: 250 }),
    }),
    [],
  );

  const register = (key: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  };
  const select = (id: string) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!dragged.current) onSelect(id);
  };
  const stationsById = useMemo(
    () => new Map(stations.map((station) => [station.id, station])),
    [stations],
  );
  const windById = useMemo(
    () => new Map(windStations.map((station) => [station.id, station])),
    [windStations],
  );

  return (
    <>
      <div ref={container} className="size-full" />
      {overlay &&
        createPortal(
          <div
            className="contents"
            onPointerDownCapture={() => {
              dragged.current = false;
            }}
          >
            {markers.map((marker) => {
              // A marker is centered on a point without size, which its translation places from
              // the top left corner of the map.
              const point = cn(
                "absolute top-0 left-0 size-0 hover:z-10",
                marker.id === selectedId && "z-20",
              );
              if (marker.kind === "buoy") {
                const station = stationsById.get(marker.id);
                if (!station || station.heightMeters === null) return null;
                return (
                  <div key={marker.key} ref={register(marker.key)} className={point}>
                    <BuoyPill
                      className="absolute -translate-1/2"
                      aria-label={station.label}
                      title={station.name}
                      heightMeters={station.heightMeters}
                      periodSeconds={station.periodSeconds}
                      directionDegrees={station.directionDegrees}
                      freshness={station.freshness}
                      selected={station.id === selectedId}
                      saved={station.isSaved}
                      onClick={select(station.id)}
                    />
                  </div>
                );
              }
              const station = windById.get(marker.id);
              if (!station) return null;
              return (
                <div key={marker.key} ref={register(marker.key)} className={point}>
                  <WindBadge
                    className="absolute -translate-1/2"
                    aria-label={station.label}
                    title={station.name}
                    speedKnots={station.speedKnots}
                    directionDegrees={station.directionDegrees}
                    selected={station.id === selectedId}
                    onClick={select(station.id)}
                  />
                </div>
              );
            })}
            {userLocation && (
              <div ref={register("user")} className="absolute top-0 left-0 size-0">
                <UserDot
                  role="img"
                  aria-label={userLocationLabel}
                  className="absolute -translate-1/2"
                />
              </div>
            )}
          </div>,
          overlay,
        )}
    </>
  );
}
