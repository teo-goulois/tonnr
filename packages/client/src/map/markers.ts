import { type Freshness, freshnessOf, toKnots } from "../format";
import { periodOf, type Station } from "../viewer/types";

// What the map draws of a station as a marker of its own, as the web's `StationMap` and the
// app's say it alike: what a buoy and a wind station say, the gauge of a buoy's pill, which of
// them have a marker and where it stands, and on which side the pill of the break in hand opens.
// Each app draws the markers with its own views. Decisions 018, 040 and 069.

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
  // In one of the reader's lists.
  isSaved: boolean;
  // What a screen reader says for the station's marker.
  label: string;
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
  label: string;
};

/** How an app writes what a marker says, in the reader's units and language. */
export type MarkerWords = {
  formatHeight: (meters: number) => string;
  formatSeconds: (seconds: number) => string;
  formatWind: (knots: number) => string;
  compassPoint: (degrees: number) => string;
  formatAgo: (date: Date, now: number) => string;
  // "from {direction}" and "wind {speed}", as the apps' messages say them.
  map_from: (inputs: { direction: string }) => string;
  map_wind_speed: (inputs: { speed: string }) => string;
};

const HOUR_MS = 60 * 60 * 1000;
/** A wind reading older than this says little of the wind now. */
export const FRESH_WIND_MS = 2 * HOUR_MS;

/** A buoy, with its last reading when it is recent enough to say the sea now. */
export function describeStation(
  station: Station,
  now: number,
  savedIds: ReadonlySet<string>,
  words: MarkerWords,
): MapStation {
  const reading = station.latestReading;
  const freshness = freshnessOf(reading?.observedAt, now);
  const shown = freshness === "none" ? null : reading;
  const height = shown?.significantHeightMeters ?? null;
  const period = periodOf(shown);
  const direction = shown?.peakDirectionDegrees ?? null;

  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    heightMeters: height,
    periodSeconds: period,
    directionDegrees: direction,
    freshness,
    isSheltered: station.exposure === "sheltered",
    isSaved: savedIds.has(station.id),
    label: [
      station.name,
      height !== null && words.formatHeight(height),
      period !== null && words.formatSeconds(period),
      direction !== null && words.map_from({ direction: words.compassPoint(direction) }),
      shown && words.formatAgo(shown.observedAt, now),
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/** A station's wind, or none when it measured none lately. */
export function describeWind(station: Station, now: number, words: MarkerWords): MapWind | null {
  const reading = station.latestReading;
  const speed = toKnots(reading?.windSpeedMetersPerSecond);
  if (!reading || speed === null || now - reading.observedAt.getTime() > FRESH_WIND_MS) return null;
  const direction = reading.windDirectionDegrees;
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    speedKnots: speed,
    directionDegrees: direction,
    label: [
      station.name,
      words.map_wind_speed({ speed: words.formatWind(speed) }),
      direction !== null && words.map_from({ direction: words.compassPoint(direction) }),
    ]
      .filter(Boolean)
      .join(", "),
  };
}

// The gauge of a buoy's pill is drawn in a box of 24 points, with the chip in its middle. To
// change its look, change these numbers:
// - bars: how many bars the ring has. Six matches the six hours a reading stays on the map.
// - stroke: how thick a bar is. 2 is bold, 1 is a hairline.
// - inset: the room between the ring and the chip. The chip takes what is left, so a thinner ring
//   or a smaller inset gives a bigger chip.
// - gap: the gap between two bars, as a share of one bar's slot. 0.15 is tight, 0.3 airy.
// `GAUGE_BARS_LIT` says how many bars each freshness lights.
export const GAUGE = { box: 24, bars: 6, stroke: 1.25, inset: 1.25, gap: 0.15 } as const;
export const GAUGE_BARS_LIT: Record<Freshness, number> = { fresh: 6, aging: 4, old: 2, none: 0 };
/** The chip inside the gauge, which says the height by its color: 19 points. */
export const GAUGE_CHIP = GAUGE.box - 2 * (GAUGE.stroke + GAUGE.inset);
/** The radius of the gauge's ring, to the middle of its line. */
export const GAUGE_RADIUS = (GAUGE.box - GAUGE.stroke) / 2;

/**
 * The dashes of the gauge's two circles, the track and the bars that are lit, in lengths of
 * `slot`, which one bar and its gap take: 1 where the circle is measured in bars, as a page can
 * say with `pathLength`, or the ring's circumference over the bars, where it cannot. The lit
 * circle is none when no bar is lit. The offset starts the first bar half a gap after the top.
 */
export function gaugeDashes(freshness: Freshness, slot = 1) {
  const lit = GAUGE_BARS_LIT[freshness];
  const bar = (1 - GAUGE.gap) * slot;
  const gap = GAUGE.gap * slot;
  return {
    track: [bar, gap],
    // The lit bars, then one gap as long as the bars that are out.
    lit:
      lit > 0
        ? [
            ...Array.from({ length: lit - 1 }, () => [bar, gap]).flat(),
            bar,
            (GAUGE.bars - lit) * slot + gap,
          ]
        : null,
    offset: -gap / 2,
  };
}

/** How much larger a selected marker is drawn, from the point it stands on. */
export const SELECTED_SCALE = 1.1;

/** More markers than this hide the map, and the dots under them still say where the stations are. */
export const MAX_MARKERS = 140;
/** The room a buoy's pill and a wind badge take, a little more than they are drawn. */
export const BUOY_BOX = { width: 104, height: 32 } as const;
export const WIND_BOX = { width: 50, height: 26 } as const;
/** A wind badge sits above its point, so a buoy that also measures the wind keeps both. */
export const WIND_LIFT = 24;

type Rankable = {
  id: string;
  heightMeters: number | null;
  isSaved: boolean;
  isSheltered: boolean;
};

/**
 * The buoys that measured something, the biggest seas first: the selected one, then the saved
 * ones, always come before, and a sheltered site after the sea outside.
 */
export function rankStations<T extends Rankable>(
  stations: readonly T[],
  selectedId: string | undefined,
): T[] {
  const rank = (station: T) =>
    (station.id === selectedId ? 1000 : 0) +
    (station.isSaved ? 100 : 0) +
    (station.isSheltered ? -50 : 0) +
    (station.heightMeters ?? -1);
  return stations
    .filter((station) => station.heightMeters !== null)
    .sort((a, b) => rank(b) - rank(a));
}

export type Box = { left: number; top: number; right: number; bottom: number };

export function overlaps(box: Box, others: readonly Box[]) {
  return others.some(
    (other) =>
      box.left < other.right &&
      box.right > other.left &&
      box.top < other.bottom &&
      box.bottom > other.top,
  );
}

export type MarkerKind = "buoy" | "wind";
export type Marker = { key: string; kind: MarkerKind; id: string };
/** A marker that has room, and the point it stands on, from the map's top left corner. */
export type PlacedMarker = Marker & { x: number; y: number };

type Located = { id: string; longitude: number; latitude: number };

/**
 * The markers that fit without covering one another, in the order they are given: the buoys,
 * ranked, then the wind. The selected buoy always has its marker; none has one off the map, and
 * no more than `MAX_MARKERS` are drawn. `buoys` or `wind` is none when its switch is off.
 */
export function placeMarkers({
  buoys,
  wind,
  selectedId,
  project,
  size,
}: {
  buoys: readonly Located[] | null;
  wind: readonly Located[] | null;
  selectedId: string | undefined;
  project: (longitude: number, latitude: number) => { x: number; y: number };
  size: { width: number; height: number };
}): PlacedMarker[] {
  const taken: Box[] = [];
  const placed: PlacedMarker[] = [];

  const place = (
    marker: Marker,
    at: Located,
    box: { width: number; height: number },
    lift: number,
    always: boolean,
  ) => {
    if (placed.length >= MAX_MARKERS && !always) return;
    const point = project(at.longitude, at.latitude);
    const x = Math.round(point.x);
    const y = Math.round(point.y) - lift;
    const bounds = {
      left: x - box.width / 2,
      right: x + box.width / 2,
      top: y - box.height / 2,
      bottom: y + box.height / 2,
    };
    if (
      bounds.right < 0 ||
      bounds.left > size.width ||
      bounds.bottom < 0 ||
      bounds.top > size.height
    ) {
      return;
    }
    if (!always && overlaps(bounds, taken)) return;
    taken.push(bounds);
    placed.push({ ...marker, x, y });
  };

  for (const station of buoys ?? []) {
    place(
      { key: `buoy:${station.id}`, kind: "buoy", id: station.id },
      station,
      BUOY_BOX,
      0,
      station.id === selectedId,
    );
  }
  for (const station of wind ?? []) {
    place(
      { key: `wind:${station.id}`, kind: "wind", id: station.id },
      station,
      WIND_BOX,
      WIND_LIFT,
      false,
    );
  }
  return placed;
}

/** Whether two layouts draw the same markers, in the same order, wherever each stands. */
export function sameMarkers(previous: readonly Marker[], next: readonly Marker[]) {
  return (
    previous.length === next.length &&
    previous.every((marker, index) => marker.key === next[index]!.key)
  );
}

/**
 * Whether the pill of the break in hand opens to the left of its disc: when the room to the
 * right, up to what covers that edge, is narrower than the pill drawn selected, and there is room
 * on the left.
 */
export function opensLeft({
  x,
  pillWidth,
  mapWidth,
  coveredRight = 0,
}: {
  x: number;
  // As wide as it is drawn, selected.
  pillWidth: number;
  mapWidth: number;
  coveredRight?: number;
}) {
  return mapWidth - coveredRight - x < pillWidth && x > pillWidth;
}
