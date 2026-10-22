import type { CircleLayerSpecification } from "@maplibre/maplibre-react-native";
import type { MapStation, MapWind } from "@repo/client/map/markers";
import { SEA_ARROW } from "@repo/client/map/sea";
import type { Recent } from "@repo/client/recents";
import type { ScaleStop } from "@repo/client/sea-scales";

import type { LngLat } from "./view";

// What the map draws, as GeoJSON its layers read, and the shapes it gives them: the web's
// `StationMap`, drawn by MapLibre Native in place of the browser's. Each value has its color from
// the sea's scales of packages/client, as the web's markers have theirs. A module that imports
// nothing of React Native, so that a test reads it.

/** A buoy and a station that measures the wind, as packages/client describes them. */
export type { MapStation, MapWind };

/** A surf break of the catalogue, or a spot of the account's own: a place, with a name. */
export type MapPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  // A break the reader looked at lately: it stands out, and is named from afar (decision 042).
  recent?: boolean;
};

/** What a press on the map can open. */
export type PlaceKind = "station" | "break" | "spot";

/** The names of the images the map draws in its discs, which `map-images.ts` makes. */
export const IMAGES = {
  wave: "break-wave",
  pin: "spot-pin",
  seaArrow: SEA_ARROW.image,
} as const;

// A break is a dot from afar, which grows into a disc as the map comes closer: at a few zooms, the
// radius of the disc and the width of the edge around it, in points. The web's own.
export const BREAK_DISCS = [
  { zoom: 4, radius: 1.5, edge: 0.7 },
  { zoom: 7, radius: 2.5, edge: 0.8 },
  { zoom: 9, radius: 4, edge: 1 },
  { zoom: 10.5, radius: 7, edge: 1.4 },
  { zoom: 12, radius: 10, edge: 1.5 },
];
/** The wave is drawn in the disc once it is wide enough to hold it. */
export const BREAK_WAVE_ZOOM = 9.75;
export const BREAK_NAME_ZOOM = 9;
/** A break looked at lately is no smaller than this from afar, and has its name there. */
export const RECENT_RADIUS = 4;
/** A spot's disc is as wide from afar as from near, and holds its pin. */
export const SPOT_RADIUS = 7;
export const SPOT_NAME_ZOOM = 7;
/** The icon of a disc, as wide as this in points before the map scales it. */
export const DISC_ICON = 13;
/**
 * A buoy's dot, under its pill or alone where the pill has no room, and a sheltered site's, small
 * and faded, so that it is not read as the sea outside.
 */
export const BUOY_RADIUS = 5.5;
export const SHELTERED_RADIUS = 3.5;
/** The selected buoy's ring, which shows round a buoy that has no pill. */
export const BUOY_RING = 10;
/** A wind station's dot, under its badge. */
export const WIND_RADIUS = 3;
/** A name runs no wider than this, in letters' heights, before it takes a second line. */
export const NAME_WIDTH = 12;
/** The basemap's own type, which its glyphs are drawn in. */
export const BOLD_FONT = ["Noto Sans Bold"];
export const NAME_SIZE = 11;

/** An expression of MapLibre's style, as JSON. */
export type Expression = Extract<
  NonNullable<NonNullable<CircleLayerSpecification["paint"]>["circle-radius"]>,
  unknown[]
>;

/** An interpolation of a property along a scale of the sea, as MapLibre reads one. */
export function scaleExpression(property: string, scale: readonly ScaleStop[]): Expression {
  return [
    "interpolate",
    ["linear"],
    ["get", property],
    ...scale.flatMap((stop) => [stop.value, stop.color]),
  ] as unknown as Expression;
}

/** A value of a break's paint that follows the size of its disc: one for each zoom of `BREAK_DISCS`. */
export function byBreakDisc(
  value: (disc: (typeof BREAK_DISCS)[number]) => number | Expression,
): Expression {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...BREAK_DISCS.flatMap((disc) => [disc.zoom, value(disc)]),
  ] as unknown as Expression;
}

const point = (longitude: number, latitude: number) => ({
  type: "Point" as const,
  coordinates: [longitude, latitude],
});

export function stationFeatures(stations: readonly MapStation[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: point(station.longitude, station.latitude),
      properties: {
        kind: "station",
        id: station.id,
        height: station.heightMeters ?? -1,
        sheltered: station.isSheltered,
      },
    })),
  };
}

export function windFeatures(stations: readonly MapWind[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: point(station.longitude, station.latitude),
      properties: {
        kind: "station",
        id: station.id,
        speed: station.speedKnots,
      },
    })),
  };
}

export function placeFeatures(
  places: readonly MapPlace[],
  kind: "break" | "spot",
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: point(place.longitude, place.latitude),
      properties: { kind, id: place.id, name: place.name, recent: place.recent === true },
    })),
  };
}

/**
 * The breaks as the map draws them: those looked at last stand out, and are drawn whether they
 * are among those in view or not, since from afar the map is given some of them only. A list
 * shown alone is drawn as it is. Decision 042.
 */
export function withRecents(
  breaks: readonly MapPlace[],
  recents: readonly Recent[],
  alone: boolean,
): MapPlace[] {
  const looked = recents.filter((recent) => recent.kind === "break");
  if (alone || looked.length === 0) return [...breaks];
  const ids = new Set(looked.map((recent) => recent.id));
  return [
    ...breaks.filter((found) => !ids.has(found.id)),
    ...looked.map(({ id, name, latitude, longitude }) => ({
      id,
      name,
      latitude,
      longitude,
      recent: true,
    })),
  ];
}

/**
 * What a press found: of the features under the finger, the one nearest to it. A feature that
 * says no kind or no id is none of the map's own.
 */
export function pressed(
  features: readonly GeoJSON.Feature[],
  at: LngLat,
): { kind: PlaceKind; id: string; at: LngLat } | undefined {
  let nearest: { kind: PlaceKind; id: string; at: LngLat } | undefined;
  let shortest = Number.POSITIVE_INFINITY;
  const across = Math.cos((at[1] * Math.PI) / 180);
  for (const feature of features) {
    const { kind, id } = (feature.properties ?? {}) as { kind?: unknown; id?: unknown };
    if (typeof id !== "string" || (kind !== "station" && kind !== "break" && kind !== "spot")) {
      continue;
    }
    if (feature.geometry?.type !== "Point") continue;
    const [longitude, latitude] = feature.geometry.coordinates as [number, number];
    // The map can show the world more than once: the copy nearest to the press counts.
    const east = (((longitude - at[0] + 540) % 360) - 180) * across;
    const distance = Math.hypot(east, latitude - at[1]);
    if (distance >= shortest) continue;
    shortest = distance;
    nearest = { kind, id, at: [longitude, latitude] };
  }
  return nearest;
}
