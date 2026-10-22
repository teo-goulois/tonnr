import { type EventSubscription, requireOptionalNativeModule } from "expo";

export { TILE_HOST } from "./host";

/** What a tile is answered with: an HTTP status as MapLibre reads one, and the PNG of a 200. */
export type TileAnswer = { status: 200; png: Uint8Array } | { status: 204 | 404 | 503 };

type NativeMapTiles = {
  answer(id: string, status: number, data: Uint8Array | null): Promise<void>;
  addListener(
    event: "onTile",
    listener: (request: { id: string; url: string }) => void,
  ): EventSubscription;
  addListener(event: "onCancel", listener: (request: { id: string }) => void): EventSubscription;
};

// Optional, so that a build made before the module still runs the app's JavaScript, without the
// tiles it draws.
const native = requireOptionalNativeModule<NativeMapTiles>("MapTiles");

/** Whether this build answers the tiles of `TILE_HOST`. */
export const drawsTiles = native !== null;

/**
 * Answers each tile MapLibre asks of `TILE_HOST` with what `draw` makes of its address, until the
 * subscription is removed. `draw` is given a signal that aborts once MapLibre no longer wants the
 * tile. A tile asked while nothing listens waits for a listener.
 */
export function serveTiles(
  draw: (address: string, signal: AbortSignal) => Promise<TileAnswer>,
): EventSubscription {
  if (!native) return { remove: () => {} };
  const drawing = new Map<string, AbortController>();
  const cancelled = native.addListener("onCancel", ({ id }) => {
    drawing.get(id)?.abort();
    drawing.delete(id);
  });
  const asked = native.addListener("onTile", ({ id, url }) => {
    const controller = new AbortController();
    drawing.set(id, controller);
    void draw(url, controller.signal)
      // A tile that failed to be drawn is asked again later.
      .catch((): TileAnswer => ({ status: 503 }))
      .then((answer) => {
        drawing.delete(id);
        if (controller.signal.aborted) return;
        return native.answer(id, answer.status, answer.status === 200 ? answer.png : null);
      })
      .catch(() => {
        // A tile MapLibre no longer waits for has no one to answer.
      });
  });
  return {
    remove: () => {
      asked.remove();
      cancelled.remove();
      for (const controller of drawing.values()) controller.abort();
      drawing.clear();
    },
  };
}
