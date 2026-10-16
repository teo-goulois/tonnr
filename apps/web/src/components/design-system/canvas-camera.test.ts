import { describe, expect, it, vi } from "vitest";
import {
  CAMERA_KEY,
  DEFAULT_CAMERA,
  cameraOf,
  fitCamera,
  readCamera,
  saveCamera,
  zoomAt,
} from "./canvas-camera";

describe("a canvas camera kept by this workspace", () => {
  it("rejects malformed, non-finite and incomplete cameras and bounds valid ones", () => {
    for (const invalid of [
      null,
      {},
      { x: 0, y: 0, zoom: NaN },
      { x: Infinity, y: 0, zoom: 1 },
      { x: "0", y: 0, zoom: 1 },
    ])
      expect(cameraOf(invalid)).toBeNull();
    expect(cameraOf({ x: 1e9, y: -1e9, zoom: 1e9 })).toEqual({ x: 100000, y: -100000, zoom: 3 });
    expect(cameraOf({ x: 0, y: 0, zoom: -1 })?.zoom).toBeGreaterThan(0);
  });
  it("keeps the world point under the cursor fixed even at a zoom limit", () => {
    const cursor = { x: 570, y: 230 };
    for (const factor of [0.00001, 0.7, 2, 1000, 1e308]) {
      const next = zoomAt(DEFAULT_CAMERA, cursor.x, cursor.y, factor);
      expect((cursor.x - next.x) / next.zoom).toBeCloseTo(
        (cursor.x - DEFAULT_CAMERA.x) / DEFAULT_CAMERA.zoom,
      );
      expect((cursor.y - next.y) / next.zoom).toBeCloseTo(
        (cursor.y - DEFAULT_CAMERA.y) / DEFAULT_CAMERA.zoom,
      );
    }
  });
  it("ignores malformed zoom gestures without losing the current camera", () => {
    for (const factor of [NaN, Infinity, -1, 0])
      expect(zoomAt(DEFAULT_CAMERA, 10, 20, factor)).toEqual(DEFAULT_CAMERA);
  });
  it("fits measured content below the controls on phone and desktop", () => {
    const bounds = { x: 0, y: 0, width: 4150, height: 10000 };
    for (const [width, height] of [
      [390, 844],
      [1280, 800],
    ]) {
      const camera = fitCamera(bounds, width!, height!);
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(80);
      expect(camera.x + bounds.width * camera.zoom).toBeLessThanOrEqual(width!);
      expect(camera.y + bounds.height * camera.zoom).toBeLessThanOrEqual(height!);
    }
  });
  it("stores only the versioned camera and reads it again", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    saveCamera(storage, DEFAULT_CAMERA);
    expect(readCamera(storage)).toEqual(DEFAULT_CAMERA);
    expect(JSON.parse(values.get(CAMERA_KEY)!)).toEqual({ version: 1, camera: DEFAULT_CAMERA });
  });
  it("falls back for unavailable storage, quota errors, malformed or oversized records and unknown formats", () => {
    expect(
      readCamera({
        getItem: () => {
          throw Error("unavailable");
        },
        removeItem: vi.fn(),
      }),
    ).toBeNull();
    expect(() =>
      saveCamera(
        {
          setItem: () => {
            throw Error("quota");
          },
        },
        DEFAULT_CAMERA,
      ),
    ).not.toThrow();
    for (const raw of [
      "{",
      "x".repeat(1025),
      '{"version":2,"positions":[1],"history":[]}',
      '{"version":1,"camera":{}}',
    ]) {
      expect(readCamera({ getItem: () => raw, removeItem: vi.fn() })).toBeNull();
    }
  });
});
