import { latitudeOf, mercatorY } from "./view";

// The sea of the map, as the web and the app draw it alike (decision 018): the moments the model
// has a field for and the one the map shows, how close its tiles are asked, and the arrows that
// point the way the waves go, on a grid that holds still while the map moves and tightens as it
// comes closer, read from the tiles of the mean wave direction the API describes. What reads a
// tile's pixels is given to the arrows, since a page and a phone decode a picture with other
// tools.

/**
 * The model's cells are about nine kilometres wide, and a tile of this zoom gives each about one
 * pixel. The map then blends a pixel into the next, and the sea shades evenly. A closer tile says
 * nothing more, and draws each cell as a square.
 */
export const SEA_MAX_ZOOM = 4;

/**
 * The arrow drawn on the sea, as an image of the map: its name, its size in points, its ink and
 * the edge a point wide around it, and how much of the sea shows through. It is finer than the
 * arrow that says a direction in the panels, light with a dark edge, so it reads on every color
 * of the sea without covering it.
 */
export const SEA_ARROW = {
  image: "sea-arrow",
  size: 15,
  ink: "#ffffff",
  edge: "rgba(0, 0, 0, 0.35)",
  opacity: 0.85,
} as const;

/**
 * The version of what `spreadSea` and `paintSea` draw. An app that keeps a tile it drew by its
 * address puts it there, and asks the tile again once it changes: whatever makes them draw a tile
 * otherwise changes it, which their tests hold.
 */
export const SEA_DRAWING = 1;

/**
 * Gives every empty pixel of a sea tile, given as RGBA, the value of the nearest pixel that has
 * one, so that the sea reaches the shore: the model leaves out the cells that touch the land. A
 * tile with no sea at all stays empty.
 */
export function spreadSea(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  const queue = new Int32Array(width * height);
  let filled = 0;
  for (let pixel = 0; pixel < queue.length; pixel++) {
    if (pixels[pixel * 4 + 3] !== 0) queue[filled++] = pixel;
  }
  if (filled === 0) return;

  const spread = (from: number, to: number) => {
    if (pixels[to * 4 + 3] !== 0) return;
    pixels.copyWithin(to * 4, from * 4, from * 4 + 4);
    queue[filled++] = to;
  };
  for (let next = 0; next < filled && filled < queue.length; next++) {
    const from = queue[next]!;
    const column = from % width;
    if (column > 0) spread(from, from - 1);
    if (column < width - 1) spread(from, from + 1);
    if (from >= width) spread(from, from - width);
    if (from < queue.length - width) spread(from, from + width);
  }
}

/**
 * Colors each pixel of a gray sea tile, given as RGBA, by the color its level has in `colors`,
 * `seaColorTable`'s: four bytes a level. A transparent pixel has no sea, and stays so. Whether the
 * tile holds any sea.
 */
export function paintSea(pixels: Uint8Array | Uint8ClampedArray, colors: Uint8ClampedArray) {
  let sea = false;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    sea = true;
    const color = pixels[index]! * 4;
    pixels[index] = colors[color]!;
    pixels[index + 1] = colors[color + 1]!;
    pixels[index + 2] = colors[color + 2]!;
    pixels[index + 3] = colors[color + 3]!;
  }
  return sea;
}

/** The moments the model has a field for, as the API says them. */
export type SeaFields = { start: Date; end: Date; stepSeconds: number };

/** The instants the sea can be shown at: a day back, and as far ahead as the model goes. */
export type SeaTimes = {
  // The model's latest field that is not in the future.
  present: number;
  earliest: number;
  latest: number;
  stepMs: number;
};

const HOUR_MS = 60 * 60 * 1000;
/** How far back the sea can be shown. */
const SEA_PAST_MS = 24 * HOUR_MS;

/**
 * The model's last instants often spill a few hours into one more day, by the clock of the
 * reader: the sea's instants stop at the end of the day before, so that their last day is a whole
 * one.
 */
export function endOfLastWholeDay(latest: number, stepMs: number) {
  const midnight = new Date(latest).setHours(0, 0, 0, 0);
  const nextMidnight = new Date(midnight).setDate(new Date(midnight).getDate() + 1);
  if (latest + stepMs >= nextMidnight) return latest;
  return latest - (Math.floor((latest - midnight) / stepMs) + 1) * stepMs;
}

/**
 * The model's latest field that is not in the future, and how far back and ahead the sea can be
 * shown. The model keeps years of the past: a day back is enough to see what just came in. None
 * for a model that says no step.
 */
export function seaTimes(fields: SeaFields | undefined, now: number): SeaTimes | undefined {
  const stepMs = (fields?.stepSeconds ?? 0) * 1000;
  if (!fields || stepMs <= 0) return undefined;
  const start = fields.start.getTime();
  const onStep = (time: number) => start + Math.floor((time - start) / stepMs) * stepMs;
  const present = onStep(now);
  return {
    present,
    earliest: Math.max(start, onStep(present - SEA_PAST_MS)),
    latest: endOfLastWholeDay(onStep(fields.end.getTime()), stepMs),
    stepMs,
  };
}

/** The instant `steps` fields from the present, within those the sea can be shown at. */
export function seaTimeAt(times: SeaTimes, steps = 0) {
  return Math.min(Math.max(times.present + steps * times.stepMs, times.earliest), times.latest);
}

/** Tiles of where the waves come from, as the API describes them. */
export type DirectionTiles = {
  tileUrlTemplate: string;
  encoding: { degreesByLevel: readonly number[] };
};

/** What the map shows: its edges, and how close it is. */
export type SeaView = { west: number; south: number; east: number; north: number; zoom: number };

export type SeaArrow = { longitude: number; latitude: number; fromDegrees: number };

/**
 * Reads a tile into its gray levels, one for each pixel of a square, -1 where the model has no
 * sea. Null for a tile that could not be read.
 */
export type TileReader = (address: string) => Promise<Int16Array | null>;

// How many arrows are drawn across one tile of the basemap, each way.
const ARROWS_PER_TILE = 8;
// The closest zoom a tile of the direction is asked at. A pixel of it is then a third of a cell
// of the model: a closer tile says nothing more, and asks more tiles of the service.
const DIRECTION_MAX_ZOOM = 6;
const REMEMBERED_TILES = 64;

/**
 * The arrows of the sea, and the tiles they are read from, kept between two views: one for the
 * map that draws them.
 */
export function seaArrowsReader(read: TileReader) {
  const levels = new Map<string, Int16Array | null>();
  const loading = new Set<string>();

  function load(key: string, address: string, onLoaded: () => void) {
    if (loading.has(key)) return;
    loading.add(key);
    read(address)
      // A tile that fails is not asked again until the app starts again: its sea has no arrows.
      .catch(() => null)
      .then((found) => {
        loading.delete(key);
        levels.set(key, found);
        // The oldest goes first: a map keeps its keys in the order they came.
        for (const oldest of levels.keys()) {
          if (levels.size <= REMEMBERED_TILES) break;
          levels.delete(oldest);
        }
        onLoaded();
      });
  }

  /**
   * Where to draw an arrow on the sea, and where the waves there come from. The tiles it needs and
   * does not have are asked for, and `onLoaded` is called as each comes. A view whose west is
   * greater than its east crosses the antimeridian, and runs east past 180.
   */
  return function arrows(
    view: SeaView,
    time: Date,
    tiles: DirectionTiles,
    onLoaded: () => void,
  ): SeaArrow[] {
    const zoom = Math.max(0, Math.floor(view.zoom));
    const cells = 2 ** zoom * ARROWS_PER_TILE;
    // A tile of 256 pixels, a quarter of the width of a tile of the basemap at the map's zoom.
    const tileZoom = Math.min(DIRECTION_MAX_ZOOM, Math.max(0, zoom - 1));
    const tilesAcross = 2 ** tileZoom;
    const iso = time.toISOString();
    const east = view.east < view.west ? view.east + 360 : view.east;

    const found: SeaArrow[] = [];
    const firstColumn = Math.floor(((view.west + 180) / 360) * cells);
    const lastColumn = Math.floor(((east + 180) / 360) * cells);
    const firstRow = Math.max(0, Math.floor(mercatorY(view.north) * cells));
    const lastRow = Math.min(cells - 1, Math.floor(mercatorY(view.south) * cells));
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const x = (column + 0.5) / cells;
        const y = (row + 0.5) / cells;
        // A map that shows the date line counts longitudes past 180.
        const worldX = ((x % 1) + 1) % 1;
        const tileX = Math.floor(worldX * tilesAcross);
        const tileY = Math.floor(y * tilesAcross);
        const key = `${iso}/${tileZoom}/${tileX}/${tileY}`;
        const tile = levels.get(key);
        if (tile === undefined) {
          load(
            key,
            tiles.tileUrlTemplate
              .replace("{z}", String(tileZoom))
              .replace("{x}", String(tileX))
              .replace("{y}", String(tileY))
              .replace("{time}", encodeURIComponent(iso)),
            onLoaded,
          );
          continue;
        }
        if (tile === null) continue;

        const width = Math.round(Math.sqrt(tile.length));
        const pixel =
          Math.floor(((y * tilesAcross) % 1) * width) * width +
          Math.floor(((worldX * tilesAcross) % 1) * width);
        const level = tile[pixel] ?? -1;
        const fromDegrees = level < 0 ? undefined : tiles.encoding.degreesByLevel[level];
        if (fromDegrees === undefined) continue;
        found.push({ longitude: x * 360 - 180, latitude: latitudeOf(y), fromDegrees });
      }
    }
    return found;
  };
}

/** The gray levels of a tile's pixels, given as RGBA: -1 where a pixel is transparent. */
export function levelsOf(pixels: ArrayLike<number>) {
  const levels = new Int16Array(Math.floor(pixels.length / 4));
  for (let pixel = 0; pixel < levels.length; pixel++) {
    levels[pixel] = pixels[pixel * 4 + 3] === 0 ? -1 : (pixels[pixel * 4] ?? 0);
  }
  return levels;
}

/** The way the waves go, from the bearing they come from. */
export const goingTo = (fromDegrees: number) => Math.round(fromDegrees + 180) % 360;
