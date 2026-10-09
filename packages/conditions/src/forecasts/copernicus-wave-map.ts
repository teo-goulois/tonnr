import { fetchJson, fetchText } from "@repo/upstream";
import { Cache, Effect, Exit, Schema } from "effect";
import { z } from "zod";

// The Copernicus Marine Service draws its products as map tiles, readable without an account.
// This product is Météo-France's global wave model: a field every three hours on a 1/12° grid,
// ten days ahead. The browser fetches the tiles itself, and this module only describes them.
const WMTS_URL = "https://wmts.marine.copernicus.eu/teroWmts";
const PRODUCT = "GLOBAL_ANALYSISFORECAST_WAV_001_027";
// A dataset's name ends with a version, `_202411` on 2026-10-08, so the layer is looked up.
const DATASET_PREFIX = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_";
// The significant wave height.
const VARIABLE = "VHM0";
const CAPABILITIES_URL = `${WMTS_URL}/${PRODUCT}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`;

// The pyramid every web map uses, so a matrix is a zoom, a column an x, and a row a y.
const MATRIX_SET = "EPSG:3857";
const TILE_SIZE = 256 as const;

// A tile is colored as its style says, and a gray ramp leaves the palette to the client. The
// service's help page lists the ramps, the capabilities only the variable's own. A ramp the
// service does not know gives that one without a word, so the legend is read too: it names the
// ramp that was used.
const COLORMAP = "gray";
const MIN_METERS = 0;
const MAX_METERS = 10;
const STYLE = `cmap:${COLORMAP},range:${MIN_METERS}/${MAX_METERS}`;
// The colors of a ramp, and the levels a channel of a pixel can take.
const LEVELS = 256;

const CACHE_HOURS = 1;

export const WAVE_MAP_SOURCE = {
  name: "Copernicus Marine Service",
  url: `https://data.marine.copernicus.eu/product/${PRODUCT}/description`,
  // The credit the licence asks for a product that was changed, here by the client's palette,
  // and the product's DOI.
  attribution:
    "Generated using E.U. Copernicus Marine Service Information; " +
    "https://doi.org/10.48670/moi-00017",
  license: {
    type: "copernicus-marine",
    url: "https://marine.copernicus.eu/user-corner/service-commitments-and-licence",
    commercialUse: true,
  },
};

export class WaveMapFormatError extends Schema.TaggedError<WaveMapFormatError>()(
  "WaveMapFormatError",
  { message: Schema.String },
) {}

function formatError(message: string) {
  return new WaveMapFormatError({ message: `Copernicus Marine's wave map: ${message}` });
}

/**
 * What stands between the tags of each element of this name. None of the elements read here
 * holds another of its own name, so an element ends at the first closing tag. The document
 * comes from outside: the search passes over it once, however it is written.
 */
function elements(xml: string, name: string) {
  const opening = new RegExp(`<${name}(?:\\s[^<>]*)?>`, "g");
  const closing = `</${name}>`;
  const found: string[] = [];
  for (;;) {
    const tag = opening.exec(xml);
    if (!tag) break;
    const end = xml.indexOf(closing, opening.lastIndex);
    if (end === -1) break;
    found.push(xml.slice(opening.lastIndex, end));
    opening.lastIndex = end + closing.length;
  }
  return found;
}

/** The text of the first element of this name. */
function text(xml: string, name: string) {
  return elements(xml, name)[0]?.trim();
}

/** Reads a moment written in UTC, as `2026-10-08T18:00:00Z`, with or without a fraction. */
function parseInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // `Date` reads 31 February as 3 March.
  return date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : null;
}

/** Reads a period of hours, minutes, and seconds, as `PT10800S` or `PT3H`, into seconds. */
function parsePeriodSeconds(value: string) {
  const match = /^PT(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** Reads `start/end/period`, the way the service writes the moments a layer has a field for. */
function parseTimes(value: string) {
  const [startText = "", endText = "", periodText = "", ...rest] = value.split("/");
  const start = parseInstant(startText);
  const end = parseInstant(endText);
  const stepSeconds = parsePeriodSeconds(periodText);
  if (!start || !end || !stepSeconds || rest.length > 0) return null;

  // The end must be one of the moments, or the client would ask for a field that does not exist.
  const span = end.getTime() - start.getTime();
  return span > 0 && span % (stepSeconds * 1000) === 0 ? { start, end, stepSeconds } : null;
}

/** Reads a whole number in decimal digits. `Number` alone reads `0x100`, and an empty text as 0. */
function parseWholeNumber(value: string | undefined) {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

/** The zooms of the tile pyramid, or null when the matrix set is not the one web maps use. */
function readZooms(matrixSet: string) {
  const zooms = new Set<number>();
  for (const matrix of elements(matrixSet, "TileMatrix")) {
    const read = (name: string) => parseWholeNumber(text(matrix, name));
    const zoom = read("ows:Identifier");
    const isPyramid =
      zoom !== null &&
      read("TileWidth") === TILE_SIZE &&
      read("TileHeight") === TILE_SIZE &&
      read("MatrixWidth") === 2 ** zoom &&
      read("MatrixHeight") === 2 ** zoom;
    if (!isPyramid) return null;
    zooms.add(zoom);
  }
  if (zooms.size === 0) return null;

  const minZoom = Math.min(...zooms);
  const maxZoom = Math.max(...zooms);
  // Every zoom in between must exist, since the client is told only the two ends.
  return zooms.size === maxZoom - minZoom + 1 ? { minZoom, maxZoom } : null;
}

/** The address of a tile, with `{z}`, `{x}`, `{y}`, and `{time}` left for the client to fill. */
function tileUrlTemplate(layer: string, updated: string | undefined) {
  const template =
    `${WMTS_URL}?service=WMTS&version=1.0.0&request=GetTile` +
    `&layer=${encodeURIComponent(layer)}&style=${encodeURIComponent(STYLE)}` +
    `&format=${encodeURIComponent("image/png")}` +
    `&tilematrixset=${encodeURIComponent(MATRIX_SET)}` +
    "&tilematrix={z}&tilerow={y}&tilecol={x}&time={time}";
  // The service tells a browser to keep a tile for thirty days, and its own cache keeps it too,
  // while a forecast is computed again twice a day. It ignores a parameter it does not know, so
  // the moment the data last changed makes each run's tiles a new address.
  return updated ? `${template}&updated=${encodeURIComponent(updated)}` : template;
}

/**
 * Reads the service's capabilities: which layer holds the wave height, the zooms its tiles
 * exist at, and the moments it has a field for. Returns an error when the document has changed.
 */
export function readCapabilities(xml: string) {
  const layers = elements(xml, "Layer")
    .map((content) => ({ content, id: text(content, "ows:Identifier") ?? "" }))
    .filter(({ id }) => {
      const [product, dataset = "", variable, ...rest] = id.split("/");
      return (
        product === PRODUCT &&
        dataset.startsWith(DATASET_PREFIX) &&
        variable === VARIABLE &&
        rest.length === 0
      );
    })
    // Two versions of the dataset may be listed while one replaces the other. A version is a
    // year and a month, so the last name in order is the newer.
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
  const layer = layers.at(-1);
  if (!layer) return formatError("the capabilities list no layer of the wave height");

  const hasPngTiles = elements(layer.content, "Format").some(
    (format) => format.trim() === "image/png",
  );
  const isInMatrixSet = elements(layer.content, "TileMatrixSetLink").some(
    (link) => text(link, "TileMatrixSet") === MATRIX_SET,
  );
  if (!hasPngTiles || !isInMatrixSet) {
    return formatError(`the layer has no PNG tiles in ${MATRIX_SET}`);
  }

  const matrixSet = elements(xml, "TileMatrixSet").find(
    (set) => text(set, "ows:Identifier") === MATRIX_SET,
  );
  const zooms = matrixSet === undefined ? null : readZooms(matrixSet);
  if (!zooms) {
    return formatError(`${MATRIX_SET} is no longer a pyramid of ${TILE_SIZE} px tiles`);
  }

  const timeValues = elements(layer.content, "Dimension")
    .filter((dimension) => text(dimension, "ows:Identifier") === "time")
    .flatMap((dimension) => elements(dimension, "Value"));
  const [timeValue = "", ...otherTimeValues] = timeValues;
  const times = otherTimeValues.length === 0 ? parseTimes(timeValue.trim()) : null;
  if (!times) {
    const found = timeValues.join(", ").slice(0, 200);
    return formatError(`the times of the layer are not one start, end, and period: ${found}`);
  }

  // An extra of this service, not of the standard: its absence is not an error.
  const updated = text(layer.content, "admp_updated_data");

  return {
    layer: layer.id,
    tileUrlTemplate: tileUrlTemplate(
      layer.id,
      updated !== undefined && parseInstant(updated) ? updated : undefined,
    ),
    tileSize: TILE_SIZE,
    ...zooms,
    times,
  };
}

const level = z
  .number()
  .int()
  .min(0)
  .max(LEVELS - 1);

const legendSchema = z.object({
  continuous: z.object({
    // The ramp and the range that were used, which are not always the ones asked for.
    cmapName: z.literal(COLORMAP),
    valueMin: z.literal(MIN_METERS),
    valueMax: z.literal(MAX_METERS),
    units: z.literal("m"),
    logScale: z.literal(false),
    // A height outside the range takes the color of the nearest end.
    clamp: z.literal(true),
    cmap: z.object({ colorMap: z.array(z.tuple([level, level, level])).length(LEVELS) }),
  }),
});

/**
 * Reads the legend of the gray style into the height each level of red stands for, in metres.
 *
 * The service cuts the range into 256 equal bins and gives each bin a color of the ramp. The
 * ramp is even to the eye, not in its numbers: red 114 is the middle of the range, not 128, so
 * reading a level as a share of the range is wrong by up to 0.6 m. Measured on 2026-10-08
 * against the service's own values at 45 pixels: the bin is `floor(256 * share of the range)`.
 */
export function readLegend(json: unknown) {
  const legend = legendSchema.safeParse(json);
  if (!legend.success) {
    return formatError(`the legend of ${STYLE} is not the one the tiles are read with`);
  }
  const reds = legend.data.continuous.cmap.colorMap.map(([red]) => red);
  if (reds.some((red, bin) => red < (reds[bin - 1] ?? 0))) {
    return formatError("the gray ramp no longer goes from dark to light");
  }

  // One point per level the ramp uses: the middle of the bins drawn with it.
  const points: { level: number; meters: number }[] = [];
  for (let bin = 0; bin < reds.length;) {
    let last = bin;
    while (reds[last + 1] === reds[bin]) last += 1;
    const middle = ((bin + last) / 2 + 0.5) / LEVELS;
    points.push({ level: reds[bin] ?? 0, meters: MIN_METERS + middle * (MAX_METERS - MIN_METERS) });
    bin = last + 1;
  }

  // The ramp skips some levels. No pixel has them, and each takes a height between its neighbours'.
  return Array.from({ length: LEVELS }, (_, red) => {
    const below = points.findLast((point) => point.level <= red) ?? points[0];
    const above = points.find((point) => point.level >= red) ?? points.at(-1);
    if (!below || !above) return MIN_METERS;
    const share =
      above.level === below.level ? 0 : (red - below.level) / (above.level - below.level);
    return Math.round((below.meters + share * (above.meters - below.meters)) * 1000) / 1000;
  });
}

function legendUrl(layer: string) {
  const search = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "GetLegend",
    LAYER: layer,
    STYLE,
    FORMAT: "application/json",
  });
  return `${WMTS_URL}?${search}`;
}

/** Where the tiles of the wave height are and how a pixel says a height. */
const fetchWaveMap = Effect.fn("fetchWaveMap")(function* () {
  const capabilities = readCapabilities(yield* fetchText(CAPABILITIES_URL));
  if (capabilities instanceof WaveMapFormatError) return yield* capabilities;
  const { layer, ...map } = capabilities;

  const metersByLevel = readLegend(yield* fetchJson(legendUrl(layer)));
  if (metersByLevel instanceof WaveMapFormatError) return yield* metersByLevel;

  return {
    ...map,
    encoding: {
      type: "grayscale" as const,
      minMeters: MIN_METERS,
      maxMeters: MAX_METERS,
      metersByLevel,
    },
  };
});

// The description changes when a run of the model adds its hours, twice a day. An answer serves
// every visitor for an hour, with two requests to the service. A failure is not kept, so the
// next request tries again.
const cache = Effect.runSync(
  Cache.makeWith((_key: "wave-height") => fetchWaveMap(), {
    capacity: 1,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? `${CACHE_HOURS} hours` : "0 millis"),
  }),
);

export function getWaveMap() {
  return Cache.get(cache, "wave-height");
}
