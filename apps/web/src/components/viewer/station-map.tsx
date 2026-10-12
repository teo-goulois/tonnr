import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker as MapLibreMarker,
  PaddingOptions,
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

import { PinIcon, WaveIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { formatNumber, type Freshness } from "@/lib/format";
import {
  NO_READING_COLOR,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  scaleInk,
  seaColorTable,
} from "@/lib/sea-scales";

import { BreakPill, BuoyPill, SPOT_PIN_FOOT, SpotPin, UserDot, WindBadge } from "./map-markers";
import {
  addLandProtocol,
  LAND_TILE_SIZE,
  landTiles,
  rememberSea,
  seaHeights,
  seaTileKey,
  spreadSea,
} from "./sea-tiles";

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
  // True for a break the reader looked at lately: it stands out, and is named from afar.
  recent?: boolean;
};

/** A spot of the user's own: a place they named. */
export type MapSpot = MapBreak;

export type MapLayers = { sea: boolean; buoys: boolean; wind: boolean; breaks: boolean };

// West, south, east, north.
export type Bounds = [number, number, number, number];

export type MapPoint = { latitude: number; longitude: number };

export type StationMapHandle = {
  /** Brings a point to the middle of the part of the map that no drawer covers. */
  focus: (point: MapPoint, minZoom?: number) => void;
  /** Shows these points together, in the part of the map that no drawer covers. */
  fit: (points: MapPoint[]) => void;
  zoomBy: (steps: number) => void;
  /** Opens the map's credits where it draws them. They fold again when the map is moved. */
  showCredits: () => void;
};

type StationMapProps = {
  ref?: Ref<StationMapHandle>;
  stations: MapStation[];
  windStations: WindStation[];
  breaks: MapBreak[];
  // The user's own spots, which no switch hides.
  spots: MapSpot[];
  // The id of the selected station, break or spot.
  selectedId: string | undefined;
  // The selected break or spot, which may be none of those above: one opened by its address, or
  // a break of a layer that is switched off.
  selectedBreak: MapBreak | undefined;
  // True when it is a spot, which has a pin where a break has a wave.
  selectedIsSpot?: boolean;
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
  onSelectSpot: (id: string) => void;
  onBoundsChange: (bounds: Bounds) => void;
  // The spot being added. While one is, the map selects nothing: `placing` takes the markers
  // out of reach, of the keyboard too. While `onPlace` is given, a press puts the spot's marker
  // there, on the break it lands on when it lands on one. The marker stands at `draft` once
  // there is one, and can be dragged, or moved with the arrow keys.
  placing?: boolean;
  draft?: MapPoint | null;
  draftLabel?: string;
  onPlace?: (point: MapPoint, breakId?: string) => void;
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
// The model's cells are about nine kilometres wide, and a tile of this zoom gives each about one
// pixel. The map then blends a pixel into the next, and the sea shades evenly. A closer tile says
// nothing more, and draws each cell as a square.
const SEA_MAX_ZOOM = 4;
// Heights can be written on the sea in figures. They are hidden for now, as Téo asked on
// 2026-10-09 after trying them.
const SEA_HEIGHTS_SHOWN: boolean = false;
// The sea at one instant is a layer named after it.
const SEA_LAYER = "sea:";
// How long one instant of the sea takes to fade into the next.
const SEA_FADE_MS = 250;
// The source of the basemap, whose tiles say where the water is.
const BASEMAP_SOURCE = "openmaptiles";
// More markers than this hide the map, and the dots under them still say where the stations are.
const MAX_MARKERS = 140;
const BUOY_BOX = { width: 104, height: 32 };
const WIND_BOX = { width: 50, height: 26 };
// A wind badge sits above its point, so a buoy that also measures the wind keeps both.
const WIND_LIFT = 24;
// The layers a press can land on.
const DOT_LAYERS = ["spot-dots", "break-dots", "station-dots", "wind-dots"];
// How far from a dot a press still finds it, in pixels: a dot is small, and a finger is not. The
// pointer of a mouse is finer, and has to come closer.
const FINGER_REACH = 12;
const MOUSE_REACH = 6;
// The layers of the surf breaks, which their switch shows and hides together.
const BREAK_LAYERS = ["break-dots", "break-waves", "break-names", "break-recent-names"];
// A break the reader looked at lately is no smaller than this from afar, and has its name there:
// they are a few, each somewhere to go back to.
const RECENT_RADIUS = 4;
// The layers of the user's own spots.
const SPOT_LAYERS = ["spot-dots", "spot-pins", "spot-names"];
// A spot's disc is as wide from afar as from near, and wide enough for the pin drawn in it:
// the spots are few, and each is somewhere to go back to.
const SPOT_RADIUS = 7;
// The pin of a spot's disc, as an image of the map: its name and its size.
const SPOT_PIN = { image: "spot-pin", size: 13 };
const SPOT_NAME_ZOOM = 7;
// How far an arrow key moves the marker of the spot being added, in pixels, and with Shift.
const NUDGE = { step: 8, stride: 40 };
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
// A break is a dot from afar, which grows into a disc as the map comes closer: at a few zooms, the
// radius of the disc and the width of the edge around it, in pixels.
const BREAK_DISCS = [
  { zoom: 4, radius: 1.5, edge: 0.7 },
  { zoom: 7, radius: 2.5, edge: 0.8 },
  { zoom: 9, radius: 4, edge: 1 },
  { zoom: 10.5, radius: 7, edge: 1.4 },
  { zoom: 12, radius: 10, edge: 1.5 },
];
// The wave is drawn in the disc once it is wide enough to hold it.
const BREAK_WAVE_ZOOM = 9.75;
const BREAK_NAME_ZOOM = 9;
// The wave of a break's disc, as an image of the map: its name and its size.
const BREAK_WAVE = { image: "break-wave", size: 13 };
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
    rememberSea(request.url, pixels, tile.width);
    spreadSea(pixels, tile.width, tile.height);
    for (let index = 0; index < pixels.length; index += 4) {
      // A tile with no sea in it is transparent, and stays so.
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
      .replace(/^https:/, `${SEA_PROTOCOL}:`) + seaTileKey(time),
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
      properties: { id: found.id, name: found.name, recent: found.recent === true },
    })),
  };
}

// A paint of a break that follows the size of its disc: one value for each zoom of `BREAK_DISCS`.
function byBreakDisc(
  value: (disc: (typeof BREAK_DISCS)[number]) => number | ExpressionSpecification,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...BREAK_DISCS.flatMap((disc) => [disc.zoom, value(disc)]),
  ] as ExpressionSpecification;
}

// The icon of a disc as an image, which is what the map draws. Its lines are read from the icon
// the page holds, so the map and the page show the same artwork.
function iconImage(icon: SVGSVGElement, color: string, width: number) {
  const ratio = Math.min(3, Math.ceil(window.devicePixelRatio));
  const size = width * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const box = icon.viewBox.baseVal;
  context.scale(size / box.width, size / box.height);
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of icon.querySelectorAll("path")) {
    context.lineWidth = Number(path.getAttribute("stroke-width")) || 1.5;
    context.stroke(new Path2D(path.getAttribute("d") ?? ""));
  }
  return { image: context.getImageData(0, 0, size, size), pixelRatio: ratio };
}

// The dot nearest to a point of the screen, within reach. A dot under the point comes before one
// beside it, whichever layer draws it.
function nearestDot(instance: MapLibreMap, point: { x: number; y: number }, reach: number) {
  const layers = DOT_LAYERS.filter((layer) => instance.getLayer(layer));
  // A style that is still loading has drawn nothing to press.
  if (layers.length === 0) return undefined;
  const hits = instance.queryRenderedFeatures(
    [
      [point.x - reach, point.y - reach],
      [point.x + reach, point.y + reach],
    ],
    { layers },
  );
  let nearest: { id: string; kind: "station" | "break" | "spot" } | undefined;
  let shortest = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const id: unknown = hit.properties.id;
    if (typeof id !== "string" || hit.geometry.type !== "Point") continue;
    const [longitude, latitude] = hit.geometry.coordinates as [number, number];
    // The map can show the world more than once: the dot is the copy nearest to the point.
    const center = instance.getCenter().lng;
    const at = instance.project([
      longitude + Math.round((center - longitude) / 360) * 360,
      latitude,
    ]);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance >= shortest) continue;
    shortest = distance;
    const layer = hit.layer.id;
    nearest = {
      id,
      kind: layer === "break-dots" ? "break" : layer === "spot-dots" ? "spot" : "station",
    };
  }
  return nearest;
}

// A height written on the sea, in the ink that reads on the color the sea has there. The basemap
// shows through that color, so a faint edge of the other ink keeps the figure legible.
function seaHeightFeatures(heights: ReturnType<typeof seaHeights>) {
  return {
    type: "FeatureCollection" as const,
    features: heights.map((height) => {
      const ink = scaleInk(WAVE_HEIGHT_SCALE, height.meters);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [height.longitude, height.latitude] },
        properties: {
          label: formatNumber(height.meters),
          ink,
          edge: ink === "#ffffff" ? "rgba(0, 0, 0, 0.45)" : "rgba(255, 255, 255, 0.55)",
        },
      };
    }),
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
  spots,
  selectedId,
  selectedBreak,
  selectedIsSpot = false,
  layers,
  seaLayer,
  seaTime,
  theme,
  padding,
  userLocation,
  userLocationLabel,
  onSelect,
  onSelectBreak,
  onSelectSpot,
  onBoundsChange,
  placing = false,
  draft = null,
  draftLabel,
  onPlace,
}: StationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // The icon the map draws in a break's disc. It is on the page, hidden, to be read from.
  const wave = useRef<HTMLSpanElement>(null);
  // And the icon it draws in the disc of a spot.
  const spotPin = useRef<HTMLSpanElement>(null);
  // Counts the styles loaded so far. A new style drops every source and layer added to the last.
  const [styleVersion, setStyleVersion] = useState(0);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  // The break under the pointer of a mouse, whose name is shown over it.
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  // The pill of the selected break opens to the right of its disc, and to the left when the right
  // is off the map or under a drawer.
  const selectedPill = useRef<HTMLSpanElement>(null);
  const selectedPillWidth = useRef(0);
  const [selectedOpensLeft, setSelectedOpensLeft] = useState(false);
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

  const breaksById = useMemo(() => new Map(breaks.map((found) => [found.id, found])), [breaks]);
  // The selected break has its own pill, so pointing at it adds nothing.
  const hovered =
    hoveredId !== undefined && hoveredId !== selectedBreak?.id
      ? breaksById.get(hoveredId)
      : undefined;

  // The map is created once, so its handlers read the latest props through a ref.
  const latest = useRef({
    stations,
    rankedStations,
    windStations,
    selectedId,
    selectedBreak,
    hovered,
    layers,
    padding,
    userLocation,
    breaksById,
    draft,
    onSelect,
    onSelectBreak,
    onSelectSpot,
    onBoundsChange,
    placing,
    onPlace,
  });
  latest.current = {
    stations,
    rankedStations,
    windStations,
    selectedId,
    selectedBreak,
    hovered,
    layers,
    padding,
    userLocation,
    breaksById,
    draft,
    onSelect,
    onSelectBreak,
    onSelectSpot,
    onBoundsChange,
    placing,
    onPlace,
  };

  // Chooses the markers that fit without covering one another, and moves each to its point.
  const layout = useCallback(() => {
    const instance = map.current;
    const element = container.current;
    if (!instance || !element) return;

    const {
      rankedStations,
      windStations,
      selectedId,
      selectedBreak,
      hovered,
      layers,
      userLocation,
    } = latest.current;
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
    // What stands at one point and has no room to find: where the user is, and the break in hand.
    const pinned = {
      user: userLocation,
      "break:selected": selectedBreak,
      "break:hovered": hovered,
    };
    // The map can show the world more than once: what is pinned stands on the copy in view.
    const middle = instance.getCenter().lng;
    for (const [key, place] of Object.entries(pinned)) {
      if (!place) continue;
      const point = instance.project([
        place.longitude + Math.round((middle - place.longitude) / 360) * 360,
        place.latitude,
      ]);
      positions.current.set(key, { x: Math.round(point.x), y: Math.round(point.y) });
    }

    const selectedAt = positions.current.get("break:selected");
    if (selectedAt) {
      const pill = selectedPillWidth.current;
      const room = width - latest.current.padding.right - selectedAt.x;
      setSelectedOpensLeft(room < pill && selectedAt.x > pill);
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
      addLandProtocol(maplibre);
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
      // The credits start as their button: the map opens them, which would cover the timeline.
      const credits = instance.getContainer().querySelector(".maplibregl-ctrl-attrib");
      credits?.classList.remove("maplibregl-compact-show");
      credits?.removeAttribute("open");
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

      // One press selects one thing: the dot nearest to it, within the reach of what pressed.
      const canvas = instance.getCanvas();
      let reach = MOUSE_REACH;
      canvas.addEventListener("pointerdown", (event) => {
        reach = event.pointerType === "mouse" ? MOUSE_REACH : FINGER_REACH;
      });
      instance.on("click", (event: MapMouseEvent) => {
        const hit = nearestDot(instance, event.point, reach);
        const { placing, onPlace, breaksById } = latest.current;
        // While a spot is being added a press selects nothing, the marker's place being taken
        // or not.
        if (placing && !onPlace) return;
        if (onPlace) {
          // A press on the marker itself moves nothing: it is how the marker takes the keyboard.
          const pressed = event.originalEvent.target;
          if (pressed instanceof Element && pressed.closest(".maplibregl-marker")) return;
          const on = hit?.kind === "break" ? breaksById.get(hit.id) : undefined;
          if (on) onPlace({ latitude: on.latitude, longitude: on.longitude }, on.id);
          else {
            onPlace({ latitude: event.lngLat.lat, longitude: wrapLongitude(event.lngLat.lng) });
          }
          return;
        }
        if (!hit) return;
        if (hit.kind === "break") latest.current.onSelectBreak(hit.id);
        else if (hit.kind === "spot") latest.current.onSelectSpot(hit.id);
        else latest.current.onSelect(hit.id);
      });
      // The pointer of a mouse shows what a press would select, and names the break it is on. A
      // finger points at nothing before it presses.
      canvas.addEventListener("pointermove", (event) => {
        // A pointer that is dragging the map is not pointing.
        if (event.pointerType !== "mouse" || event.buttons !== 0) return;
        const hit = nearestDot(instance, { x: event.offsetX, y: event.offsetY }, MOUSE_REACH);
        // A spot being added is put where the pointer is, whatever is under it.
        canvas.style.cursor = latest.current.onPlace
          ? "crosshair"
          : hit && !latest.current.placing
            ? "pointer"
            : "";
        setHoveredId(hit?.kind === "break" ? hit.id : undefined);
      });
      canvas.addEventListener("pointerleave", () => setHoveredId(undefined));

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
    // A break is known by its id, so that the one pointed at can be drawn apart.
    instance.addSource("breaks", { type: "geojson", data: breakFeatures([]), promoteId: "id" });
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
    // A break measures nothing, so it takes no color of a scale: it is drawn in the theme's ink,
    // above the stations. The breaks are many and the map draws them itself. From afar each is a
    // dot, small enough for a coast full of them to stay a coast. Closer, the dot grows into a
    // disc, with a wave in it and the break's name beside it.
    const isHovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
    const isRecent: ExpressionSpecification = ["boolean", ["get", "recent"], false];
    instance.addLayer({
      id: "break-dots",
      type: "circle",
      source: "breaks",
      // A break looked at lately is drawn over its neighbours.
      layout: { "circle-sort-key": ["case", isRecent, 1, 0] },
      paint: {
        // The break the pointer is on stands out from its neighbours, and so does one looked at
        // lately, from afar.
        "circle-radius": byBreakDisc((disc) => [
          "+",
          ["case", isRecent, Math.max(RECENT_RADIUS, disc.radius), disc.radius],
          ["case", isHovered, 2, 0],
        ]),
        "circle-color": ink,
        "circle-stroke-width": byBreakDisc((disc) => disc.edge),
        "circle-stroke-color": surface,
      },
    });
    // Names come in once the map is close enough for them not to run into one another. The map
    // leaves out a name that would cover another, and looks for room on each side of the disc.
    // They are bold, to be told from the names of the towns behind the coast.
    instance.addLayer({
      id: "break-names",
      type: "symbol",
      source: "breaks",
      minzoom: BREAK_NAME_ZOOM,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        // Clear of the disc, in letters' heights.
        "text-radial-offset": byBreakDisc((disc) => (disc.radius + 5) / 11),
        "text-justify": "auto",
        "text-max-width": 8,
        // Where two names would meet, the one of a break looked at lately is kept.
        "symbol-sort-key": ["case", isRecent, 0, 1],
      },
      paint: {
        "text-color": ink,
        "text-halo-color": surface,
        "text-halo-width": 1.5,
      },
    });
    // The breaks looked at lately are named from afar too, before the others' names come in.
    instance.addLayer({
      id: "break-recent-names",
      type: "symbol",
      source: "breaks",
      maxzoom: BREAK_NAME_ZOOM,
      filter: isRecent,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": byBreakDisc(
          (disc) => (Math.max(RECENT_RADIUS, disc.radius) + 5) / 11,
        ),
        "text-justify": "auto",
        "text-max-width": 8,
      },
      paint: {
        "text-color": ink,
        "text-halo-color": surface,
        "text-halo-width": 1.5,
      },
    });
    // The user's own spots stand above the catalogue: a spot made from a break stands on it, and
    // is the one a press finds. A spot is a disc with a pin in it, where a break has a wave.
    const accent = themeColor("--color-1");
    instance.addSource("spots", { type: "geojson", data: breakFeatures([]) });
    instance.addLayer({
      id: "spot-dots",
      type: "circle",
      source: "spots",
      paint: {
        "circle-radius": byBreakDisc((disc) => Math.max(SPOT_RADIUS, disc.radius)),
        "circle-color": accent,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": surface,
      },
    });
    instance.addLayer({
      id: "spot-names",
      type: "symbol",
      source: "spots",
      minzoom: SPOT_NAME_ZOOM,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": byBreakDisc((disc) => (Math.max(SPOT_RADIUS, disc.radius) + 5) / 11),
        "text-justify": "auto",
        "text-max-width": 8,
      },
      paint: {
        "text-color": ink,
        "text-halo-color": surface,
        "text-halo-width": 1.5,
      },
    });
    const pinIcon = spotPin.current?.querySelector("svg");
    const pinDrawn = pinIcon && iconImage(pinIcon, surface, SPOT_PIN.size);
    if (pinDrawn) {
      if (instance.hasImage(SPOT_PIN.image)) instance.removeImage(SPOT_PIN.image);
      instance.addImage(SPOT_PIN.image, pinDrawn.image, { pixelRatio: pinDrawn.pixelRatio });
    }
    // Above the names, as a break's wave is, so that a name finds every disc taken.
    instance.addLayer({
      id: "spot-pins",
      type: "symbol",
      source: "spots",
      layout: {
        "icon-image": SPOT_PIN.image,
        "icon-size": byBreakDisc(
          (disc) => (Math.max(SPOT_RADIUS, disc.radius) * 1.3) / SPOT_PIN.size,
        ),
        "icon-padding": 3,
        "icon-allow-overlap": true,
      },
    });
    const icon = wave.current?.querySelector("svg");
    const drawn = icon && iconImage(icon, surface, BREAK_WAVE.size);
    if (drawn) {
      if (instance.hasImage(BREAK_WAVE.image)) instance.removeImage(BREAK_WAVE.image);
      instance.addImage(BREAK_WAVE.image, drawn.image, { pixelRatio: drawn.pixelRatio });
    }
    // The waves are the layer above the names, so the map places them first: a name then finds
    // every disc taken, and covers none. A wave stands for its disc from the zoom the names come
    // in at, before it is wide enough to be seen.
    instance.addLayer({
      id: "break-waves",
      type: "symbol",
      source: "breaks",
      minzoom: BREAK_NAME_ZOOM,
      layout: {
        "icon-image": BREAK_WAVE.image,
        // The wave fills the disc, less a margin, which the padding gives back to its place.
        "icon-size": byBreakDisc((disc) => (disc.radius * 1.3) / BREAK_WAVE.size),
        "icon-padding": 3,
        // Every disc has its wave.
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          BREAK_WAVE_ZOOM,
          0,
          BREAK_WAVE_ZOOM + 0.5,
          1,
        ],
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
    map.current?.getSource<GeoJSONSource>("spots")?.setData(breakFeatures(spots));
  }, [spots, styleVersion]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getLayer("station-dots")) return;
    instance.setLayoutProperty("station-dots", "visibility", layers.buoys ? "visible" : "none");
    instance.setLayoutProperty("station-selected", "visibility", layers.buoys ? "visible" : "none");
    instance.setLayoutProperty("wind-dots", "visibility", layers.wind ? "visible" : "none");
    for (const layer of BREAK_LAYERS) {
      instance.setLayoutProperty(layer, "visibility", layers.breaks ? "visible" : "none");
    }
    layout();
  }, [layers.buoys, layers.wind, layers.breaks, styleVersion, layout]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.getLayer("station-selected")) return;
    instance.setFilter("station-selected", ["==", ["get", "id"], selectedId ?? ""]);
    // The selected break or spot is drawn by its pill, which stands where its disc and its name
    // were.
    const isShown: ExpressionSpecification = ["!=", ["get", "id"], selectedBreak?.id ?? ""];
    for (const layer of [...BREAK_LAYERS, ...SPOT_LAYERS]) {
      instance.setFilter(
        layer,
        // The names from afar are those of the breaks looked at lately, and of no other.
        layer === "break-recent-names"
          ? ["all", ["boolean", ["get", "recent"], false], isShown]
          : isShown,
      );
    }
    layout();
  }, [selectedId, selectedBreak?.id, styleVersion, layout]);

  // The dot of the break pointed at grows, so that the name over it is read as its own.
  const hoveredBreakId = hovered?.id;
  useEffect(() => {
    const instance = map.current;
    if (hoveredBreakId === undefined || !instance?.getSource("breaks")) return;
    const dot = { source: "breaks", id: hoveredBreakId };
    instance.setFeatureState(dot, { hover: true });
    return () => {
      // A new style, or a map that is gone, has nothing left to undo.
      if (map.current === instance && instance.getSource("breaks")) {
        instance.removeFeatureState(dot, "hover");
      }
    };
  }, [hoveredBreakId, styleVersion]);

  // The marker of the spot being added is the map's own, which follows the finger or the mouse
  // that drags it. What it shows is drawn into it below.
  const [pin, setPin] = useState<HTMLDivElement | null>(null);
  const pinMarker = useRef<MapLibreMarker | null>(null);
  const hasDraft = draft !== null;
  const isUp = styleVersion > 0;
  useEffect(() => {
    const instance = map.current;
    if (!instance || !isUp || !hasDraft) return;
    let cancelled = false;
    let made: MapLibreMarker | undefined;
    void import("maplibre-gl").then((maplibre) => {
      const at = latest.current.draft;
      if (cancelled || !at) return;
      const element = document.createElement("div");
      // The point is the middle of the marker's foot, which is the lowest thing it draws.
      const marker = new maplibre.Marker({
        element,
        draggable: true,
        anchor: "bottom",
        offset: [0, SPOT_PIN_FOOT / 2],
      })
        .setLngLat([at.longitude, at.latitude])
        .addTo(instance);
      const place = (longitude: number, latitude: number) =>
        latest.current.onPlace?.({ latitude, longitude: wrapLongitude(longitude) });
      marker.on("dragend", () => {
        const dropped = marker.getLngLat();
        place(dropped.lng, dropped.lat);
      });
      // The keys of a control that has the focus, not a shortcut: the arrows move the marker,
      // and are stopped here so that the map under it stays where it is.
      element.addEventListener("keydown", (event) => {
        const move = ARROWS[event.key];
        const from = latest.current.draft;
        if (!move || !from) return;
        event.preventDefault();
        event.stopPropagation();
        const by = event.shiftKey ? NUDGE.stride : NUDGE.step;
        const point = instance.project([from.longitude, from.latitude]);
        const to = instance.unproject([point.x + move[0] * by, point.y + move[1] * by]);
        place(to.lng, to.lat);
      });
      made = marker;
      pinMarker.current = marker;
      setPin(element);
    });
    return () => {
      cancelled = true;
      made?.remove();
      pinMarker.current = null;
      setPin(null);
    };
  }, [hasDraft, isUp]);
  useEffect(() => {
    if (draft) pinMarker.current?.setLngLat([draft.longitude, draft.latitude]);
  }, [draft, pin]);

  // Where the basemap's tiles are, which its style leaves to a second document.
  const [basemap, setBasemap] = useState<{ tiles: string; maxZoom: number } | null>(null);
  // The layer of the sea that is in view, while the next one loads.
  const seaShown = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (styleVersion === 0 || basemap) return;
    const source = map.current?.getStyle().sources[BASEMAP_SOURCE];
    if (source?.type !== "vector" || !source.url) return;

    const controller = new AbortController();
    fetch(source.url, { signal: controller.signal })
      .then((response) => response.json())
      .then((description: { tiles?: unknown; maxzoom?: unknown }) => {
        const tiles = Array.isArray(description.tiles) ? description.tiles[0] : undefined;
        if (typeof tiles !== "string" || typeof description.maxzoom !== "number") return;
        setBasemap({ tiles, maxZoom: description.maxzoom });
      })
      // Without it the sea stays as the basemap draws it.
      .catch(() => {});
    return () => controller.abort();
  }, [styleVersion, basemap]);

  // The sea, colored by its wave height up to the shore, under the names and the roads. The
  // colors run under the land, which is drawn again over them, so the coast stays sharp.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0) return;

    const removeLayer = (id: string) => {
      if (instance.getLayer(id)) instance.removeLayer(id);
      if (instance.getSource(id)) instance.removeSource(id);
    };
    const land = instance.getPaintProperty("background", "background-color");
    const water = instance.getPaintProperty("water", "fill-color");
    const hasBasemapColors = typeof land === "string" && typeof water === "string";
    if (!layers.sea || !seaLayer || !seaTime || !basemap || !hasBasemapColors) {
      const seas = instance.getStyle().layers.filter((layer) => layer.id.startsWith(SEA_LAYER));
      for (const id of [...seas.map((layer) => layer.id), "land", "sea-heights"]) removeLayer(id);
      seaShown.current = undefined;
      return;
    }

    seaColors = seaColorTable(seaLayer.encoding.metersByLevel);
    if (!instance.getSource("land")) {
      instance.addSource("land", {
        type: "raster",
        tiles: landTiles(basemap.tiles, { land, water }),
        tileSize: LAND_TILE_SIZE,
        maxzoom: basemap.maxZoom,
      });
      const styleLayers = instance.getStyle().layers;
      const above = styleLayers[styleLayers.findIndex((layer) => layer.id === "water") + 1]?.id;
      // The land appears at once: while it fades in, the sea's colors would show through it.
      instance.addLayer(
        { id: "land", type: "raster", source: "land", paint: { "raster-fade-duration": 0 } },
        above,
      );
    }

    // Each instant is a layer of its own. The one in view stays until the next has its tiles, then
    // one fades into the other: the sea never goes blank between two instants.
    // A new style has dropped the layer that was in view.
    if (seaShown.current && !instance.getLayer(seaShown.current)) seaShown.current = undefined;
    const id = `${SEA_LAYER}${seaTime.toISOString()}`;
    if (!instance.getLayer(id)) {
      instance.addSource(id, {
        type: "raster",
        tiles: seaTiles(seaLayer, seaTime),
        tileSize: seaLayer.tileSize,
        minzoom: seaLayer.minZoom,
        maxzoom: Math.min(seaLayer.maxZoom, SEA_MAX_ZOOM),
        attribution: seaLayer.source.attribution,
      });
      instance.addLayer(
        {
          id,
          type: "raster",
          source: id,
          paint: {
            "raster-resampling": "linear",
            "raster-fade-duration": seaShown.current ? 0 : SEA_FADE_MS,
            "raster-opacity": seaShown.current ? 0 : 1,
            "raster-opacity-transition": { duration: SEA_FADE_MS, delay: 0 },
          },
        },
        "land",
      );
    }
    seaShown.current ??= id;

    const reveal = () => {
      if (!instance.getLayer(id) || !instance.isSourceLoaded(id)) return;
      instance.off("sourcedata", reveal);
      const previous = seaShown.current;
      if (previous === id) return;
      seaShown.current = id;
      instance.setPaintProperty(id, "raster-opacity", 1);
      if (!previous || !instance.getLayer(previous)) return;
      instance.setPaintProperty(previous, "raster-opacity", 0);
      // Gone once it has faded, unless the reader came back to it meanwhile.
      setTimeout(() => {
        if (seaShown.current !== previous && map.current === instance) removeLayer(previous);
      }, SEA_FADE_MS);
    };
    instance.on("sourcedata", reveal);
    reveal();
    return () => {
      instance.off("sourcedata", reveal);
      // An instant the reader only passed over never came into view.
      if (seaShown.current !== id) removeLayer(id);
    };
  }, [layers.sea, seaLayer, seaTime, basemap, styleVersion]);

  // Heights written on the sea in figures, which are hidden for now.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styleVersion === 0 || !instance.getLayer("land")) return;
    const styleLayers = instance.getStyle().layers;
    const above = styleLayers[styleLayers.findIndex((layer) => layer.id === "land") + 1]?.id;
    if (instance.getSource("sea-heights")) return;
    if (!SEA_HEIGHTS_SHOWN) return;
    instance.addSource("sea-heights", { type: "geojson", data: seaHeightFeatures([]) });
    // Under the names of the basemap, which hide a height that runs into them.
    instance.addLayer(
      {
        id: "sea-heights",
        type: "symbol",
        source: "sea-heights",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-padding": 12,
        },
        paint: {
          "text-color": ["get", "ink"],
          "text-halo-color": ["get", "edge"],
          "text-halo-width": 1,
        },
      },
      above,
    );
  }, [layers.sea, seaLayer, seaTime, basemap, styleVersion]);

  // Heights written on the sea, here and there, once the map has the tiles to read them from.
  useEffect(() => {
    const instance = map.current;
    if (!SEA_HEIGHTS_SHOWN) return;
    if (!instance || styleVersion === 0 || !layers.sea || !seaLayer || !seaTime) return;

    let written = "";
    const write = () => {
      const source = instance.getSource<GeoJSONSource>("sea-heights");
      if (!source) return;
      const bounds = instance.getBounds();
      const features = seaHeightFeatures(
        seaHeights(
          {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
            zoom: instance.getZoom(),
          },
          seaTime,
          seaLayer.encoding.metersByLevel,
          // An island smaller than a cell of the model is sea to it, and land on the map.
        ).filter(
          (height) =>
            instance.queryRenderedFeatures(instance.project([height.longitude, height.latitude]), {
              layers: ["water"],
            }).length > 0,
        ),
      );
      // Writing redraws the map, which then rests again: the same heights are not written twice.
      const signature = JSON.stringify(features);
      if (signature === written) return;
      written = signature;
      source.setData(features);
    };
    instance.on("idle", write);
    write();
    return () => {
      instance.off("idle", write);
    };
  }, [layers.sea, seaLayer, seaTime, basemap, styleVersion]);

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
      (selectedBreak?.id === selectedId ? selectedBreak : undefined);
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
  }, [selectedId, selectedBreak, stations, windStations, padding, styleVersion]);

  // How wide the pill of the selected break is, as it stands when selected: a little larger than
  // it is laid out.
  useLayoutEffect(() => {
    selectedPillWidth.current = (selectedPill.current?.offsetWidth ?? 0) * 1.1;
  }, [selectedBreak]);
  // What is pinned to a point takes its place before the browser paints it, and so does a marker
  // that has just been drawn.
  useLayoutEffect(layout, [userLocation, selectedBreak, hovered, padding, layout]);
  useLayoutEffect(() => {
    for (const [key, position] of positions.current) {
      const node = nodes.current.get(key);
      if (node) node.style.translate = `${position.x}px ${position.y}px`;
    }
  }, [markers]);

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
      fit: (points) => {
        const instance = map.current;
        const [first] = points;
        if (!instance || !first) return;
        let [west, south, east, north] = [
          first.longitude,
          first.latitude,
          first.longitude,
          first.latitude,
        ];
        for (const point of points) {
          west = Math.min(west, point.longitude);
          east = Math.max(east, point.longitude);
          south = Math.min(south, point.latitude);
          north = Math.max(north, point.latitude);
        }
        const { top, right, bottom, left } = latest.current.padding;
        instance.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            // Room for the markers and their labels, inside what the drawers leave.
            padding: { top: top + 72, right: right + 56, bottom: bottom + 56, left: left + 56 },
            // One point, or a few on one beach, are not shown closer than a bay.
            maxZoom: 11,
            duration: 600,
          },
        );
      },
      zoomBy: (steps) =>
        map.current?.easeTo({ zoom: map.current.getZoom() + steps, duration: 250 }),
      showCredits: () => {
        // What the control's own button does, for a phone that draws no button.
        const credits = map.current?.getContainer().querySelector(".maplibregl-ctrl-attrib");
        credits?.classList.add("maplibregl-compact-show");
        credits?.setAttribute("open", "");
      },
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
      {/* The tone of the map's place while it waits, which the map covers as it draws. */}
      <div ref={container} className="size-full bg-neutral-2" />
      {overlay &&
        createPortal(
          <div
            // While a spot is being added the markers are out of reach, of a press, which goes
            // through them to the map, and of the keyboard.
            inert={placing}
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
            {/* The break in hand, over its disc. Neither pill takes a press: the map does, and
                finds the break under it. The panel that is open already names the selected one. */}
            {selectedBreak && (
              <div
                ref={register("break:selected")}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-20 size-0"
              >
                <BreakPill
                  ref={selectedPill}
                  // The disc of the pill is on the break, and the pill grows from there.
                  className={cn(
                    "absolute -translate-y-1/2",
                    selectedOpensLeft
                      ? "-right-3.5 origin-[calc(100%-0.875rem)_50%]"
                      : "-left-3.5 origin-[0.875rem_50%]",
                  )}
                  name={selectedBreak.name}
                  selected
                  own={selectedIsSpot}
                  mirrored={selectedOpensLeft}
                />
              </div>
            )}
            {hovered && (
              <div
                ref={register("break:hovered")}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-30 size-0"
              >
                {/* Above the disc, which stays in sight with its neighbours. */}
                <div className="absolute bottom-4 -translate-x-1/2">
                  <BreakPill
                    className="animate-in duration-(--motion-duration) ease-theme fade-in zoom-in-95 motion-reduce:animate-none"
                    name={hovered.name}
                  />
                </div>
              </div>
            )}
          </div>,
          overlay,
        )}
      {pin && createPortal(<SpotPin aria-label={draftLabel} />, pin)}
      {/* The wave of a break, for the map to draw from. */}
      <span ref={wave} hidden>
        <WaveIcon strokeWidth={2} />
      </span>
      <span ref={spotPin} hidden>
        <PinIcon strokeWidth={2} />
      </span>
    </>
  );
}
