import { LAND_DRAWING } from "@repo/client/map/land";
import { SEA_DRAWING } from "@repo/client/map/sea";

import { TILE_HOST } from "../../../modules/map-tiles/host";

// The addresses of the tiles the app draws itself (decision 077): MapLibre asks them of the
// module's host, and the app draws each from what its address says, the sea from the model's gray
// tile and the land from the basemap's own. An address says all that its tile is drawn from, and
// MapLibre keeps a tile by its address, so the address says the version of what draws it. A module
// that imports nothing of React Native, so that a test reads it.

export type TileKind = "sea" | "land";

// The version of how `tile-painter.ts` paints a tile, changed when it paints one otherwise. The
// shared rules have versions of their own.
const PAINTING = 1;
const DRAWING: Record<TileKind, string> = {
  sea: `${SEA_DRAWING}.${PAINTING}`,
  land: `${LAND_DRAWING}.${PAINTING}`,
};

/** A tile the map asks for: which, where, and the address of what it is drawn from. */
export type TileAsked = {
  kind: TileKind;
  z: number;
  x: number;
  y: number;
  // The address the tile is drawn from, its `{z}`, `{x}` and `{y}` filled.
  source: string;
  params: URLSearchParams;
};

function template(kind: TileKind, source: string, params: Record<string, string>) {
  const query = new URLSearchParams({ v: DRAWING[kind], ...params, source });
  return `https://${TILE_HOST}/${kind}/{z}/{x}/{y}.png?${query.toString()}`;
}

/**
 * The address of the sea's tiles at a moment, for MapLibre to fill: the model's gray tiles,
 * colored by the palette named `palette`.
 */
export function seaTiles(tileUrlTemplate: string, time: Date, palette: string) {
  const source = tileUrlTemplate.replace("{time}", encodeURIComponent(time.toISOString()));
  return template("sea", source, { palette });
}

/** The address of the land's tiles, drawn from the basemap's in its colors of land and water. */
export function landTiles(basemapTiles: string, colors: { land: string; water: string }) {
  return template("land", basemapTiles, colors);
}

/** What a tile's address asks, or null for an address the app does not draw. */
export function readTile(address: string): TileAsked | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const match = /^\/(sea|land)\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url.pathname);
  const source = url.searchParams.get("source");
  if (url.host !== TILE_HOST || !match || !source) return null;
  const [, kind, z, x, y] = match as unknown as [string, TileKind, string, string, string];
  return {
    kind,
    z: Number(z),
    x: Number(x),
    y: Number(y),
    source: source.replace("{z}", z).replace("{x}", x).replace("{y}", y),
    params: url.searchParams,
  };
}

/** A short name for the colors of a palette, `seaColorTable`'s, which a sea tile's address carries. */
export function paletteName(colors: Uint8ClampedArray) {
  // FNV-1a over the colors' bytes.
  let hash = 0x811c9dc5;
  for (const byte of colors) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
