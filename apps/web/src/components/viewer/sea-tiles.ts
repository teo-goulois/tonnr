import { LAND_TILE_SIZE, waterOf } from "@repo/client/map/land";
import { levelsOf, seaArrowsReader } from "@repo/client/map/sea";

export { LAND_TILE_SIZE } from "@repo/client/map/land";
export { spreadSea } from "@repo/client/map/sea";

// Land tiles go through this protocol, which draws them from the basemap's own tiles.
export const LAND_PROTOCOL = "landtile";

// What the model says in each sea tile the map has drawn, by the tile's time and place: a gray
// level, or -1 where it says nothing. The heights written on the sea are read here.
const seaLevels = new Map<string, { levels: Int16Array; width: number; height: number }>();
const REMEMBERED_SEA_TILES = 64;
// The closest zoom a sea tile is looked for at.
const SEA_LEVELS_MAX_ZOOM = 10;
// How many heights are written across one tile of the basemap, each way.
const HEIGHTS_PER_TILE = 3;

/** The end of a sea tile's address, which says its time and its place and is not sent. */
export function seaTileKey(time: Date) {
  return `#${time.toISOString()}/{z}/{x}/{y}`;
}

/** Keeps what a sea tile says, before `spreadSea` fills what the model left blank. */
export function rememberSea(address: string, pixels: Uint8ClampedArray, width: number) {
  const levels = new Int16Array(pixels.length / 4);
  for (let pixel = 0; pixel < levels.length; pixel++) {
    levels[pixel] = pixels[pixel * 4 + 3] === 0 ? -1 : pixels[pixel * 4]!;
  }
  const key = address.slice(address.indexOf("#"));
  seaLevels.delete(key);
  seaLevels.set(key, { levels, width, height: levels.length / width });
  // The oldest goes first: a map keeps its keys in the order they came.
  for (const oldest of seaLevels.keys()) {
    if (seaLevels.size <= REMEMBERED_SEA_TILES) break;
    seaLevels.delete(oldest);
  }
}

// The gray level at a point of the world, from the closest tile that holds it. Null on land, where
// no tile is loaded, and next to a blank: a height is written only where the model is sure of the
// sea all around.
function seaLevelAt(time: Date, x: number, y: number) {
  for (let zoom = SEA_LEVELS_MAX_ZOOM; zoom >= 0; zoom--) {
    const tiles = 2 ** zoom;
    const tile = seaLevels.get(
      `#${time.toISOString()}/${zoom}/${Math.floor(x * tiles)}/${Math.floor(y * tiles)}`,
    );
    if (!tile) continue;

    const column = Math.floor(((x * tiles) % 1) * tile.width);
    const row = Math.floor(((y * tiles) % 1) * tile.height);
    const at = (c: number, r: number) =>
      tile.levels[
        Math.min(tile.height - 1, Math.max(0, r)) * tile.width +
          Math.min(tile.width - 1, Math.max(0, c))
      ]!;
    const around = [
      at(column - 1, row),
      at(column + 1, row),
      at(column, row - 1),
      at(column, row + 1),
    ];
    return around.every((level) => level >= 0) ? at(column, row) : null;
  }
  return null;
}

/**
 * Where to write a height on the sea, and which: points of a grid that holds still while the map
 * moves, and tightens as it comes closer.
 */
export function seaHeights(
  view: { west: number; south: number; east: number; north: number; zoom: number },
  time: Date,
  metersByLevel: readonly number[],
) {
  const cells = 2 ** Math.max(0, Math.floor(view.zoom)) * HEIGHTS_PER_TILE;
  // Mercator, from 0 at the north to 1 at the south.
  const toY = (latitude: number) =>
    (1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2;
  const toLatitude = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

  const heights: { longitude: number; latitude: number; meters: number }[] = [];
  const firstColumn = Math.floor(((view.west + 180) / 360) * cells);
  const lastColumn = Math.floor(((view.east + 180) / 360) * cells);
  const firstRow = Math.max(0, Math.floor(toY(view.north) * cells));
  const lastRow = Math.min(cells - 1, Math.floor(toY(view.south) * cells));
  for (let column = firstColumn; column <= lastColumn; column++) {
    for (let row = firstRow; row <= lastRow; row++) {
      const x = (column + 0.5) / cells;
      const y = (row + 0.5) / cells;
      // A map that shows the date line counts longitudes past 180.
      const level = seaLevelAt(time, ((x % 1) + 1) % 1, y);
      const meters = level === null ? undefined : metersByLevel[level];
      if (meters === undefined) continue;
      heights.push({ longitude: x * 360 - 180, latitude: toLatitude(y), meters });
    }
  }
  return heights;
}

export type { DirectionTiles } from "@repo/client/map/sea";

// The arrows on the sea are read from the tiles of the direction by the grid both apps share,
// which the browser gives its own reader of a picture.
async function readDirectionTile(address: string) {
  const response = await fetch(address);
  if (!response.ok) throw new Error(`The direction tile answered ${response.status}`);
  const tile = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(tile.width, tile.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The direction tile has no canvas to be read on");
  context.drawImage(tile, 0, 0);
  return levelsOf(context.getImageData(0, 0, tile.width, tile.height).data);
}

/**
 * Where to draw an arrow on the sea, and where the waves there come from: points of a grid that
 * holds still while the map moves, and tightens as it comes closer. The tiles it needs and does
 * not have are asked for, and `onLoaded` is called as each comes.
 */
export const seaArrows = seaArrowsReader(readDirectionTile);

/** The address of the land tiles, for a basemap whose land and water have these colors. */
export function landTiles(basemapTiles: string, colors: { land: string; water: string }) {
  const query = new URLSearchParams(colors).toString();
  return [`${basemapTiles.replace(/^https:/, `${LAND_PROTOCOL}:`)}?${query}`];
}

/**
 * Draws the land of a basemap tile, and leaves the sea transparent: the outlines both apps read,
 * in `@repo/client/map/land`, painted on a canvas.
 */
async function drawLand(address: string, signal: AbortSignal) {
  const url = new URL(address.replace(`${LAND_PROTOCOL}:`, "https:"));
  const land = url.searchParams.get("land") ?? "";
  const water = url.searchParams.get("water") ?? "";
  url.search = "";

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`The basemap tile answered ${response.status}`);

  const size = LAND_TILE_SIZE * Math.min(2, Math.ceil(window.devicePixelRatio));
  const outlines = waterOf(await response.arrayBuffer(), size);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The land tile has no canvas to draw on");
  context.fillStyle = land;
  context.fillRect(0, 0, size, size);
  if (!outlines) return canvas.transferToImageBitmap();

  context.fillStyle = water;
  context.fill(new Path2D(outlines.lakes));
  context.globalCompositeOperation = "destination-out";
  context.fill(new Path2D(outlines.ocean));
  return canvas.transferToImageBitmap();
}

let landProtocolAdded = false;

export function addLandProtocol(maplibre: typeof import("maplibre-gl")) {
  if (landProtocolAdded) return;
  landProtocolAdded = true;

  maplibre.addProtocol(LAND_PROTOCOL, async (request, abortController) => ({
    data: await drawLand(request.url, abortController.signal),
  }));
}
