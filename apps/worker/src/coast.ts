import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// How far a station stands from the sea's shore, for a map that keeps the stations of the coast
// when it has room for few: decision 048. The shore is Natural Earth's land at 1:10 million, in
// the public domain, as the package `world-atlas` gives it: its outline is the coast, and the
// great lakes are not cut out of it, so their shores are not one.

/** Beyond this the distance says nothing more to a map: it is stored as this. */
export const FAR_KM = 50;

const EARTH_KM = 6371;
const KM_PER_DEGREE = (Math.PI * EARTH_KM) / 180;
// The size of a cell of the index, in degrees: a station looks in the cells around its own.
const CELL_DEGREES = 0.5;

type Topology = {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: {
    land: {
      geometries: (
        | { type: "Polygon"; arcs: number[][] }
        | { type: "MultiPolygon"; arcs: number[][][] }
      )[];
    };
  };
};

export type Coast = {
  // The segments of the shore, four numbers each: longitude and latitude of both ends.
  segments: Float64Array;
  // The segments that cross each cell, by "row column".
  cells: Map<string, number[]>;
  // The outline of every piece of land, made continuous across the antimeridian, and closed
  // through the pole for Antarctica, by the rows of latitude each segment spans: what tells a
  // point on land from a point at sea.
  outline: Float64Array;
  rows: Map<number, number[]>;
};

type Point = [number, number];

const cellOf = (longitude: number, latitude: number) =>
  `${Math.floor(latitude / CELL_DEGREES)} ${Math.floor(longitude / CELL_DEGREES)}`;

/**
 * Whether a segment is no shore: a jump across the antimeridian, an edge drawn along it where
 * the land is cut, or the bottom of Antarctica, where the projection ends.
 */
function isNoShore([x1, y1]: Point, [x2, y2]: Point) {
  const jumps = Math.abs(x2 - x1) > 180;
  const onMeridian = Math.abs(x1) > 179.99 && Math.abs(x2) > 179.99;
  const atBottom = y1 < -85 && y2 < -85;
  return jumps || onMeridian || atBottom;
}

function addTo(
  index: Map<string, number[]> | Map<number, number[]>,
  key: string | number,
  value: number,
) {
  const map = index as Map<string | number, number[]>;
  const listed = map.get(key);
  if (listed) listed.push(value);
  else map.set(key, [value]);
}

/** Reads the land of the TopoJSON into its shore and its outline, each indexed. */
export function coastOf(topology: Topology): Coast {
  const [scaleX, scaleY] = topology.transform.scale;
  const [translateX, translateY] = topology.transform.translate;
  // The points of an arc are written as moves from the one before, in steps of the scale.
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]): Point => {
      x += dx;
      y += dy;
      return [x * scaleX + translateX, y * scaleY + translateY];
    });
  });
  const ringOf = (indexes: number[]) => {
    const ring: Point[] = [];
    for (const index of indexes) {
      // A negative index, written ~i, is arc i walked backwards.
      const points = index >= 0 ? (arcs[index] ?? []) : [...(arcs[~index] ?? [])].reverse();
      ring.push(...(ring.length > 0 ? points.slice(1) : points));
    }
    return ring;
  };
  const rings = topology.objects.land.geometries.flatMap((geometry) =>
    geometry.type === "Polygon" ? geometry.arcs.map(ringOf) : geometry.arcs.flat().map(ringOf),
  );

  const values: number[] = [];
  const outlineValues: number[] = [];
  for (const ring of rings) {
    for (let index = 1; index < ring.length; index += 1) {
      const from = ring[index - 1] as Point;
      const to = ring[index] as Point;
      if (!isNoShore(from, to)) values.push(from[0], from[1], to[0], to[1]);
    }

    // The ring made continuous: a longitude moves by less than half the earth from one point to
    // the next. A ring that goes round the earth so ends a full turn from where it began, and
    // is closed through the pole it goes round.
    const unwrapped: Point[] = [];
    for (const [x, y] of ring) {
      const before = unwrapped.at(-1);
      let longitude = x;
      if (before) {
        while (longitude - before[0] > 180) longitude -= 360;
        while (before[0] - longitude > 180) longitude += 360;
      }
      unwrapped.push([longitude, y]);
    }
    const first = unwrapped[0];
    const last = unwrapped.at(-1);
    if (!first || !last) continue;
    if (Math.abs(last[0] - first[0]) > 180) {
      const pole = unwrapped.reduce((sum, [, y]) => sum + y, 0) < 0 ? -90 : 90;
      unwrapped.push([last[0], pole], [first[0], pole]);
    }
    unwrapped.push(first);
    for (let index = 1; index < unwrapped.length; index += 1) {
      const from = unwrapped[index - 1] as Point;
      const to = unwrapped[index] as Point;
      outlineValues.push(from[0], from[1], to[0], to[1]);
    }
  }

  const segments = Float64Array.from(values);
  const cells = new Map<string, number[]>();
  for (let index = 0; index < segments.length; index += 4) {
    // A segment is a few hundred metres long: it is listed in the cells of its two ends.
    const ends = [
      cellOf(segments[index] ?? 0, segments[index + 1] ?? 0),
      cellOf(segments[index + 2] ?? 0, segments[index + 3] ?? 0),
    ];
    for (const key of new Set(ends)) addTo(cells, key, index);
  }

  const outline = Float64Array.from(outlineValues);
  const rows = new Map<number, number[]>();
  for (let index = 0; index < outline.length; index += 4) {
    const low = Math.floor(
      Math.min(outline[index + 1] ?? 0, outline[index + 3] ?? 0) / CELL_DEGREES,
    );
    const high = Math.floor(
      Math.max(outline[index + 1] ?? 0, outline[index + 3] ?? 0) / CELL_DEGREES,
    );
    for (let row = low; row <= high; row += 1) addTo(rows, row, index);
  }
  return { segments, cells, outline, rows };
}

/**
 * Whether a point is on land: a line from it going east crosses the land's outline an odd number
 * of times. An outline made continuous across the antimeridian may stand a turn east or west of
 * the point, so the point is tried there too.
 */
export function isOnLand(coast: Coast, latitude: number, longitude: number) {
  let crossings = 0;
  for (const index of coast.rows.get(Math.floor(latitude / CELL_DEGREES)) ?? []) {
    const x1 = coast.outline[index] ?? 0;
    const y1 = coast.outline[index + 1] ?? 0;
    const x2 = coast.outline[index + 2] ?? 0;
    const y2 = coast.outline[index + 3] ?? 0;
    if (y1 > latitude === y2 > latitude) continue;
    const crossing = x1 + ((latitude - y1) / (y2 - y1)) * (x2 - x1);
    for (const turn of [-360, 0, 360]) {
      if (crossing > longitude + turn) crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

/**
 * How far a point stands from the shore, in kilometres: positive on land, negative at sea, and
 * `FAR_KM` or `-FAR_KM` beyond. What the worker stores for a station.
 */
export function shoreDistanceKm(coast: Coast, latitude: number, longitude: number) {
  const distance = coastDistanceKm(coast, latitude, longitude);
  return isOnLand(coast, latitude, longitude) ? distance : -distance;
}

/**
 * The distance in kilometres from a point to the nearest shore, up to `FAR_KM`. Near a point
 * the earth is flat enough to measure on a plane whose degrees of longitude shrink with the
 * latitude. A point on land and a point at sea are measured alike.
 */
export function coastDistanceKm(coast: Coast, latitude: number, longitude: number) {
  const reachRows = Math.ceil(FAR_KM / KM_PER_DEGREE / CELL_DEGREES);
  // Nearer a pole a degree of longitude is shorter: the cells looked in reach further.
  const poleward = Math.min(Math.abs(latitude) + FAR_KM / KM_PER_DEGREE, 89.9);
  const cos = Math.cos((poleward * Math.PI) / 180);
  const reachColumns = Math.ceil(FAR_KM / (KM_PER_DEGREE * cos) / CELL_DEGREES);
  const columns = Math.round(360 / CELL_DEGREES);
  const row = Math.floor(latitude / CELL_DEGREES);
  const column = Math.floor(longitude / CELL_DEGREES);
  const kmPerLongitude = KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180);

  // A point's longitude is brought within 180 degrees of the station's, across the antimeridian.
  const near = (x: number) => (x - longitude > 180 ? x - 360 : longitude - x > 180 ? x + 360 : x);

  const reach = Math.min(reachColumns, columns / 2);
  let nearest = FAR_KM;
  const seen = new Set<number>();
  for (let rowStep = -reachRows; rowStep <= reachRows; rowStep += 1) {
    for (let step = -reach; step <= reach; step += 1) {
      // Columns wrap around the earth, from -360 to 359.
      const wrapped =
        ((((column + step + columns / 2) % columns) + columns) % columns) - columns / 2;
      for (const index of coast.cells.get(`${row + rowStep} ${wrapped}`) ?? []) {
        if (seen.has(index)) continue;
        seen.add(index);
        // The segment on a plane centred on the point, in kilometres.
        const ax = (near(coast.segments[index] ?? 0) - longitude) * kmPerLongitude;
        const ay = ((coast.segments[index + 1] ?? 0) - latitude) * KM_PER_DEGREE;
        const bx = (near(coast.segments[index + 2] ?? 0) - longitude) * kmPerLongitude;
        const by = ((coast.segments[index + 3] ?? 0) - latitude) * KM_PER_DEGREE;
        const dx = bx - ax;
        const dy = by - ay;
        const length = dx * dx + dy * dy;
        const along = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
        nearest = Math.min(nearest, Math.hypot(ax + along * dx, ay + along * dy));
      }
    }
  }
  return Math.round(nearest * 10) / 10;
}

let loaded: Coast | undefined;

/** The shore of the world, read once from the package the first time it is asked for. */
export function worldCoast() {
  if (!loaded) {
    const path = createRequire(import.meta.url).resolve("world-atlas/land-10m.json");
    loaded = coastOf(JSON.parse(readFileSync(path, "utf8")) as Topology);
  }
  return loaded;
}
