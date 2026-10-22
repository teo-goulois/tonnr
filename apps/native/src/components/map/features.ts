import type { CircleLayerSpecification } from "@maplibre/maplibre-react-native";
import { goingTo, SEA_ARROW } from "@repo/client/map/sea";
import type { Freshness } from "@repo/client/format";
import type { Recent } from "@repo/client/recents";
import {
  type ScaleStop,
  scaleInk,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
} from "@repo/client/sea-scales";

import type { LngLat } from "./view";

// What the map draws, as GeoJSON its layers read, and the shapes it gives them: the web's
// `StationMap`, drawn by MapLibre Native in place of the browser's. Each value has its color from
// the sea's scales of packages/client, as the web's markers have theirs. A module that imports
// nothing of React Native, so that a test reads it.

/** A buoy, as the map draws it. */
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
  // What the map writes beside it: its height and its period, in the reader's units.
  figures: string;
};

/** A station that measures the wind, with a reading fresh enough to draw. */
export type MapWind = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speedKnots: number;
  // Where the wind comes from. Null when it turns too much to say.
  directionDegrees: number | null;
  // The speed in the reader's unit, without the unit: the legend says it.
  figure: string;
};

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
  arrowLight: "arrow-light",
  arrowDark: "arrow-dark",
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
/** A buoy's disc, which holds the arrow of its waves, and a sheltered site's, small and faded. */
export const BUOY_RADIUS = 9;
export const SHELTERED_RADIUS = 4;
/** A wind station's disc, which holds its speed. */
export const WIND_RADIUS = 9;
/** A name runs no wider than this, in letters' heights, before it takes a second line. */
export const NAME_WIDTH = 12;
/** The basemap's own type, which its glyphs are drawn in. */
export const BOLD_FONT = ["Noto Sans Bold"];
export const NAME_SIZE = 11;

// How faded a reading is as it ages: the web's gauge empties, the map's disc pales. Its age is
// said in words in the place's sheet.
export const FADE: Record<Freshness, number> = { fresh: 1, aging: 0.85, old: 0.6, none: 1 };

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

const arrowOn = (scale: readonly ScaleStop[], value: number) =>
  scaleInk([...scale], value) === "#ffffff" ? IMAGES.arrowLight : IMAGES.arrowDark;

/** The way the waves or the wind go, from the bearing they come from. */
export { goingTo };

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
        fade: FADE[station.freshness],
        figures: station.figures,
        // The arrow in the disc, in the ink that reads on its color; none when the buoy does not
        // say where the waves come from, or measured nothing lately.
        arrow:
          station.directionDegrees !== null && station.heightMeters !== null && !station.isSheltered
            ? arrowOn(WAVE_HEIGHT_SCALE, station.heightMeters)
            : "",
        rotate: station.directionDegrees === null ? 0 : goingTo(station.directionDegrees),
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
        figure: station.figure,
        ink: scaleInk(WIND_SPEED_SCALE, station.speedKnots),
        arrow: station.directionDegrees === null ? "" : IMAGES.arrowDark,
        rotate: station.directionDegrees === null ? 0 : goingTo(station.directionDegrees),
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
