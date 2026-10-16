export type Camera = { x: number; y: number; zoom: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export const CAMERA_KEY = "tonnr:design-system-canvas:camera";
export const DEFAULT_CAMERA: Camera = { x: 32, y: 80, zoom: 0.65 };
const MIN_ZOOM = 0.025;
const MAX_ZOOM = 3;

export function cameraOf(value: unknown): Camera | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, zoom } = value as Camera;
  if (![x, y, zoom].every((number) => typeof number === "number" && Number.isFinite(number)))
    return null;
  return {
    x: Math.max(-100000, Math.min(100000, x)),
    y: Math.max(-100000, Math.min(100000, y)),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
  };
}

export function readCamera(storage: Pick<Storage, "getItem" | "removeItem">): Camera | null {
  try {
    const raw = storage.getItem(CAMERA_KEY);
    if (!raw) return null;
    if (raw.length > 1024) {
      storage.removeItem(CAMERA_KEY);
      return null;
    }
    const kept = JSON.parse(raw);
    // Version 1 is the first format. Unknown formats never restore positions or history.
    if (kept?.version === 1) return cameraOf(kept.camera);
    storage.removeItem(CAMERA_KEY);
  } catch {
    /* Storage can be unavailable. */
  }
  return null;
}

export function saveCamera(storage: Pick<Storage, "setItem">, camera: Camera) {
  try {
    storage.setItem(CAMERA_KEY, JSON.stringify({ version: 1, camera }));
  } catch {
    /* A private browser still has a camera for this visit. */
  }
}

export function zoomAt(camera: Camera, x: number, y: number, factor: number): Camera {
  if (![x, y, factor].every(Number.isFinite) || factor <= 0) return camera;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  return cameraOf({
    x: x - ((x - camera.x) * zoom) / camera.zoom,
    y: y - ((y - camera.y) * zoom) / camera.zoom,
    zoom,
  })!;
}

export function fitCamera(bounds: Bounds, width: number, height: number): Camera {
  const zoom = cameraOf({
    x: 0,
    y: 0,
    zoom: Math.min(
      (width - 64) / Math.max(bounds.width, 1),
      (height - 128) / Math.max(bounds.height, 1),
      1,
    ),
  })!.zoom;
  return cameraOf({
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: 80 + (height - 128 - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  })!;
}
