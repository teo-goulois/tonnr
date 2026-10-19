// Arrows on the sea, which point the way the waves go (decision 018): the web's `seaArrows`, on a
// grid that holds still while the map moves and tightens as it comes closer, read from the tiles
// of the mean wave direction the API describes. What reads a tile's pixels is given to it, since
// a phone decodes a picture with other tools than a browser: `sea-tile-reader.ts` does, with
// Skia. A module that imports nothing of React Native, so that a test reads it.

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

// How many arrows are drawn across one tile of the basemap, each way. The web's own.
const ARROWS_PER_TILE = 8;
// The closest zoom a tile of the direction is asked at. A pixel of it is then a third of a cell
// of the model: a closer tile says nothing more, and asks more tiles of the service.
const DIRECTION_MAX_ZOOM = 6;
const REMEMBERED_TILES = 64;

/** Mercator, from 0 at the north to 1 at the south. */
const toY = (latitude: number) =>
  (1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2;
const toLatitude = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

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
      .then((read) => {
        loading.delete(key);
        levels.set(key, read);
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
   * does not have are asked for, and `onLoaded` is called as each comes.
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

    const found: SeaArrow[] = [];
    const firstColumn = Math.floor(((view.west + 180) / 360) * cells);
    const lastColumn = Math.floor(((view.east + 180) / 360) * cells);
    const firstRow = Math.max(0, Math.floor(toY(view.north) * cells));
    const lastRow = Math.min(cells - 1, Math.floor(toY(view.south) * cells));
    for (let column = firstColumn; column <= lastColumn; column++) {
      for (let row = firstRow; row <= lastRow; row++) {
        const x = (column + 0.5) / cells;
        const y = (row + 0.5) / cells;
        // A map that shows the date line counts longitudes past 180.
        const worldX = ((x % 1) + 1) % 1;
        const tileX = Math.floor(worldX * tilesAcross);
        const tileY = Math.floor(y * tilesAcross);
        const key = `${iso}/${tileZoom}/${tileX}/${tileY}`;
        const read = levels.get(key);
        if (read === undefined) {
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
        if (read === null) continue;

        const width = Math.round(Math.sqrt(read.length));
        const pixel =
          Math.floor(((y * tilesAcross) % 1) * width) * width +
          Math.floor(((worldX * tilesAcross) % 1) * width);
        const level = read[pixel] ?? -1;
        const fromDegrees = level < 0 ? undefined : tiles.encoding.degreesByLevel[level];
        if (fromDegrees === undefined) continue;
        found.push({ longitude: x * 360 - 180, latitude: toLatitude(y), fromDegrees });
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

/** The arrows as the map draws them, turned the way the waves go. */
export function arrowFeatures(arrows: readonly SeaArrow[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: arrows.map((arrow) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [arrow.longitude, arrow.latitude] },
      properties: { rotate: Math.round(arrow.fromDegrees + 180) % 360 },
    })),
  };
}
