import { createRequire } from "node:module";

import sharp, { type Sharp } from "sharp";

// What the worker makes of a photo that was sent: a picture to look at, and a small one for a
// list. Each is turned the way the camera held it, keeps its colors, and keeps nothing else of
// what the file said: no place, no time, no device. Decision 066.

// The longest side of the picture that is looked at: a phone's screen held across, at its
// density, with a little to zoom.
const DISPLAY_EDGE = 2560;
// The shortest side of the small one, so that it fills a square of a list without blur.
const THUMB_EDGE = 480;
// More pixels than a phone's camera takes, and fewer than a file made to fill the worker's
// memory once decoded.
export const PHOTO_MOST_PIXELS = 100_000_000;

/** One form of a medium, as it is written to the bucket. */
export type Rendition = { body: Buffer; contentType: string; width: number; height: number };

/** Why a photo could not be made: it was not one, or it was too big to open. */
export class PhotoRefused extends Error {
  constructor(readonly reason: "unreadable" | "too_large") {
    super(`The photo is ${reason}`);
  }
}

// What this package uses of heic-decode, which ships no types: the images of a file, each decoded
// into its pixels when asked. It is loaded the first time a phone's HEIF comes.
type HeicImage = {
  width: number;
  height: number;
  decode(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
};
type HeicDecode = { all(input: { buffer: Uint8Array }): Promise<HeicImage[]> };
let heic: HeicDecode | undefined;
const heicDecode = () => (heic ??= createRequire(import.meta.url)("heic-decode") as HeicDecode);

// The brands a HEIF file of a phone names in its first box, which sharp's own build cannot open.
const HEVC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

/** Whether a file is a HEIF image of the kind iPhones take, which needs a decoder of its own. */
export function isHevcImage(file: Uint8Array) {
  if (file.byteLength < 12) return false;
  const box = Buffer.from(file.buffer, file.byteOffset, 12);
  if (box.toString("latin1", 4, 8) !== "ftyp") return false;
  return HEVC_BRANDS.has(box.toString("latin1", 8, 12).replace(/\0/g, " ").trim());
}

/**
 * The image a file holds, ready to resize. A HEIF of a phone is decoded apart, turned as its
 * file says by the decoder itself: it is then not turned again.
 */
async function opened(file: Uint8Array): Promise<Sharp> {
  const options = { limitInputPixels: PHOTO_MOST_PIXELS, failOn: "error" as const };
  if (!isHevcImage(file)) {
    const image = sharp(file, options);
    const { width, height } = await image.metadata().catch(() => {
      throw new PhotoRefused("unreadable");
    });
    if (!width || !height) throw new PhotoRefused("unreadable");
    if (width * height > PHOTO_MOST_PIXELS) throw new PhotoRefused("too_large");
    // Turned the way the camera held it, which the file says and the copies no longer will.
    return image.rotate();
  }

  const images = await heicDecode()
    .all({ buffer: file })
    .catch(() => {
      throw new PhotoRefused("unreadable");
    });
  const first = images[0];
  if (!first) throw new PhotoRefused("unreadable");
  if (first.width * first.height > PHOTO_MOST_PIXELS) throw new PhotoRefused("too_large");
  const { width, height, data } = await first.decode().catch(() => {
    throw new PhotoRefused("unreadable");
  });
  return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
    limitInputPixels: PHOTO_MOST_PIXELS,
  });
}

async function rendered(image: Sharp, contentType: string): Promise<Rendition> {
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  return { body: data, contentType, width: info.width, height: info.height };
}

/**
 * The two forms of a photo: AVIF to look at, which keeps a phone's photo sharp in a tenth of its
 * size, and WebP for the small one, which a list decodes fast. Throws `PhotoRefused` for a file
 * that is no photo or too big.
 */
export async function renderPhoto(file: Uint8Array) {
  const image = await opened(file);
  // The color profile is kept, so that a phone's wide colors stay as they were taken. Nothing
  // else of the file's metadata is written.
  const base = image.keepIccProfile();
  const [display, thumb] = await Promise.all([
    rendered(
      base
        .clone()
        .resize({
          width: DISPLAY_EDGE,
          height: DISPLAY_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .avif({ quality: 60, effort: 4 }),
      "image/avif",
    ),
    rendered(
      base
        .clone()
        .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "outside", withoutEnlargement: true })
        .webp({ quality: 72 }),
      "image/webp",
    ),
  ]);
  return { display, thumb };
}
