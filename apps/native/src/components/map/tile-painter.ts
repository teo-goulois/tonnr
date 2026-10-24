import { LAND_TILE_SIZE, waterOf } from "@repo/client/map/land";
import { paintSea, spreadSea } from "@repo/client/map/sea";
import { seaColorTable } from "@repo/client/sea-scales";
import { AlphaType, BlendMode, ColorType, ImageFormat, Skia } from "@shopify/react-native-skia";
import { PixelRatio } from "react-native";

import { serveTiles, type TileAnswer } from "../../../modules/map-tiles";
import { paletteName, readTile, tellTileFailed, type TileAsked } from "./drawn-tiles";

// The tiles the app draws itself (decision 077), painted with Skia as the web paints them on a
// canvas, with the same rules: the sea of the model's gray tile spread to the shore and colored by
// the sea's scale, and the land of the basemap's tile, which the sea's colors pass under.

// The palettes the sea has been asked in, by the name a tile's address gives them.
const palettes = new Map<string, Uint8ClampedArray>();

/** Names the palette of a table of heights, as the address of a sea tile names it. */
export function seaPalette(metersByLevel: readonly number[]) {
  const colors = seaColorTable(metersByLevel);
  const name = paletteName(colors);
  palettes.set(name, colors);
  return name;
}

const RGBA = { colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };

// A tile whose source failed is asked again by the map, which hears of it (`tellTileFailed`), and
// one the source does not have never is.
const failed = (status: number): TileAnswer => ({ status: status === 404 ? 404 : 503 });

// How long a tile's source is waited for. MapLibre gives up on a tile after 30 seconds and never
// asks it again: the app answers first, so that the map hears of it and asks again.
const SOURCE_WAIT_MS = 20_000;

/** The source of a tile, its status and its bytes, within `SOURCE_WAIT_MS`. */
async function fetchSource(address: string, signal: AbortSignal) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal.addEventListener("abort", stop);
  const timer = setTimeout(stop, SOURCE_WAIT_MS);
  try {
    const response = await fetch(address, { signal: controller.signal });
    if (!response.ok) return { status: response.status, bytes: null };
    return { status: response.status, bytes: await response.arrayBuffer() };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

async function drawSea(tile: TileAsked, signal: AbortSignal): Promise<TileAnswer> {
  const colors = palettes.get(tile.params.get("palette") ?? "");
  // A palette not named since the app started: the map asks again once it is.
  if (!colors) return { status: 503 };
  const response = await fetchSource(tile.source, signal);
  if (!response.bytes) return failed(response.status);
  const bytes = new Uint8Array(response.bytes);
  // MapLibre no longer wants it.
  if (signal.aborted) return { status: 503 };
  const gray = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!gray) return { status: 503 };
  const width = gray.width();
  const height = gray.height();
  const pixels = gray.readPixels(0, 0, { width, height, ...RGBA });
  if (!(pixels instanceof Uint8Array)) return { status: 503 };

  spreadSea(pixels, width, height);
  if (!paintSea(pixels, colors)) return { status: 204 };
  const sea = Skia.Image.MakeImage(
    { width, height, ...RGBA },
    Skia.Data.fromBytes(pixels),
    width * 4,
  );
  if (!sea) return { status: 503 };
  return { status: 200, png: sea.encodeToBytes(ImageFormat.PNG, 100) };
}

// The land is drawn as finely as the web draws it, at twice its points at most.
const LAND_PIXELS = LAND_TILE_SIZE * Math.min(2, Math.ceil(PixelRatio.get()));
// A tile of land alone is one color, which a small picture says as well: MapLibre stretches it.
const PLAIN_PIXELS = 16;
const plainTiles = new Map<string, Uint8Array>();

function plainTile(color: string) {
  const known = plainTiles.get(color);
  if (known) return known;
  const surface = Skia.Surface.Make(PLAIN_PIXELS, PLAIN_PIXELS);
  if (!surface) return null;
  surface.getCanvas().drawColor(Skia.Color(color));
  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100);
  plainTiles.set(color, png);
  return png;
}

async function drawLand(tile: TileAsked, signal: AbortSignal): Promise<TileAnswer> {
  const land = tile.params.get("land");
  const water = tile.params.get("water");
  if (!land || !water) return { status: 404 };
  const response = await fetchSource(tile.source, signal);
  if (!response.bytes) return failed(response.status);
  const basemapTile = response.bytes;
  if (signal.aborted) return { status: 503 };
  const outlines = waterOf(basemapTile, LAND_PIXELS);
  if (!outlines?.ocean && !outlines?.lakes) {
    const png = plainTile(land);
    return png ? { status: 200, png } : { status: 503 };
  }

  const surface = Skia.Surface.Make(LAND_PIXELS, LAND_PIXELS);
  if (!surface) return { status: 503 };
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color(land));
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  const lakes = outlines.lakes ? Skia.Path.MakeFromSVGString(outlines.lakes) : null;
  if (lakes) {
    paint.setColor(Skia.Color(water));
    canvas.drawPath(lakes, paint);
  }
  const sea = outlines.ocean ? Skia.Path.MakeFromSVGString(outlines.ocean) : null;
  if (sea) {
    // The sea is cut out of the land, and the colors under it show through.
    paint.setBlendMode(BlendMode.DstOut);
    canvas.drawPath(sea, paint);
  }
  surface.flush();
  return { status: 200, png: surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG, 100) };
}

let drawing = false;

/** Answers the tiles the map asks of the app, from now on. Called again, it does nothing. */
export function drawTiles() {
  if (drawing) return;
  drawing = true;
  serveTiles(async (address, signal) => {
    const tile = readTile(address);
    if (!tile) return { status: 404 };
    const answer = await (tile.kind === "sea" ? drawSea(tile, signal) : drawLand(tile, signal))
      // A source that did not answer in time, or not at all.
      .catch((): TileAnswer => ({ status: 503 }));
    // A tile MapLibre no longer wants did not fail.
    if (answer.status === 503 && !signal.aborted) tellTileFailed(tile.kind);
    return answer;
  });
}
