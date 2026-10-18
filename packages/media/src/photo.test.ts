import { readFile } from "node:fs/promises";

import exifr from "exifr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PhotoRefused, isHevcImage, renderPhoto } from "./photo";

// A photo as a phone writes one: wider than tall as its sensor reads, turned by its EXIF, with
// the place it was taken.
async function phonePhoto() {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: "#2a7ab0" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "Phone", Model: "Phone 15" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "43/1 28/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "1/1 34/1 0/1",
      },
    })
    .toBuffer();
}

describe("renderPhoto", () => {
  it("turns the photo as it was held, and keeps nothing of where or with what it was taken", async () => {
    const file = await phonePhoto();
    expect((await exifr.gps(file))?.latitude).toBeCloseTo(43.4667, 3);

    const { display, thumb } = await renderPhoto(file);
    expect(display.contentType).toBe("image/avif");
    expect(thumb.contentType).toBe("image/webp");
    // Turned a quarter: taller than wide, as the phone was held.
    expect([display.width, display.height]).toEqual([300, 400]);
    // Not made bigger than it was taken.
    expect(Math.min(thumb.width, thumb.height)).toBe(300);
    for (const body of [display.body, thumb.body]) {
      const meta = await sharp(body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
      expect(await exifr.gps(body).catch(() => undefined)).toBeUndefined();
    }
  });

  it("makes a big photo smaller", async () => {
    const file = await sharp({
      create: { width: 6000, height: 4000, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    const { display, thumb } = await renderPhoto(file);
    expect([display.width, display.height]).toEqual([2560, 1707]);
    expect([thumb.width, thumb.height]).toEqual([720, 480]);
  });

  it("opens a phone's HEIF, which sharp's own build cannot", async () => {
    // 96 by 64 pixels of one blue, made with macOS's `sips`.
    const file = await readFile(new URL("./samples/tiny.heic", import.meta.url));
    expect(isHevcImage(file)).toBe(true);
    const { display, thumb } = await renderPhoto(file);
    expect([display.width, display.height]).toEqual([96, 64]);
    expect(thumb.contentType).toBe("image/webp");
    const { dominant } = await sharp(display.body).stats();
    expect(dominant.b).toBeGreaterThan(dominant.r);
  });

  it("refuses what is no photo", async () => {
    await expect(renderPhoto(new TextEncoder().encode("<svg onload=alert(1)>"))).rejects.toThrow(
      PhotoRefused,
    );
  });

  it("knows a phone's HEIF by its first box", () => {
    const box = (brand: string) =>
      new Uint8Array([0, 0, 0, 24, ...Buffer.from(`ftyp${brand}`, "latin1")]);
    expect(isHevcImage(box("heic"))).toBe(true);
    expect(isHevcImage(box("mif1"))).toBe(true);
    expect(isHevcImage(box("avif"))).toBe(false);
    expect(isHevcImage(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });
});
