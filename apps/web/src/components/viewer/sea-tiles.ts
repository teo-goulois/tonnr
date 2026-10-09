import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

// Land tiles go through this protocol, which draws them from the basemap's own tiles.
export const LAND_PROTOCOL = "landtile";
// The basemap draws a tile over this many pixels of the screen.
export const LAND_TILE_SIZE = 512;

// A polygon, among the kinds of geometry a vector tile holds.
const POLYGON = 3;

/**
 * Gives every empty pixel of a sea tile the value of the nearest pixel that has one, so that the
 * sea reaches the shore: the model leaves out the cells that touch the land. A tile with no sea at
 * all stays empty.
 */
export function spreadSea(pixels: Uint8ClampedArray, width: number, height: number) {
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

/** The address of the land tiles, for a basemap whose land and water have these colors. */
export function landTiles(basemapTiles: string, colors: { land: string; water: string }) {
  const query = new URLSearchParams(colors).toString();
  return [`${basemapTiles.replace(/^https:/, `${LAND_PROTOCOL}:`)}?${query}`];
}

/**
 * Draws the land of a basemap tile, and leaves the sea transparent. The basemap describes the
 * water and not the land, so the land is what the sea leaves. A lake keeps the color the basemap
 * gives it: the sea's colors pass under it as under the land.
 */
async function drawLand(address: string, signal: AbortSignal) {
  const url = new URL(address.replace(`${LAND_PROTOCOL}:`, "https:"));
  const land = url.searchParams.get("land") ?? "";
  const water = url.searchParams.get("water") ?? "";
  url.search = "";

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`The basemap tile answered ${response.status}`);
  const layer = new VectorTile(new PbfReader(await response.arrayBuffer())).layers.water;

  const size = LAND_TILE_SIZE * Math.min(2, Math.ceil(window.devicePixelRatio));
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The land tile has no canvas to draw on");
  context.fillStyle = land;
  context.fillRect(0, 0, size, size);
  if (!layer) return canvas.transferToImageBitmap();

  const scale = size / layer.extent;
  const sea = new Path2D();
  const lakes = new Path2D();
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index);
    if (feature.type !== POLYGON || feature.properties.brunnel === "tunnel") continue;
    const path = feature.properties.class === "ocean" ? sea : lakes;
    for (const ring of feature.loadGeometry()) {
      ring.forEach((point, corner) => {
        if (corner === 0) path.moveTo(point.x * scale, point.y * scale);
        else path.lineTo(point.x * scale, point.y * scale);
      });
      path.closePath();
    }
  }
  context.fillStyle = water;
  context.fill(lakes);
  context.globalCompositeOperation = "destination-out";
  context.fill(sea);
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
