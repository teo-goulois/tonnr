import type { ImageEntry } from "@maplibre/maplibre-react-native";
import { ArrowSymbolUpIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { PixelRatio } from "react-native";

import type { GlyphIcon } from "@/components/shared/glyph";

import { DISC_ICON, IMAGES } from "./features";
import { levelsOf } from "./sea-arrows";
import { type IconInk, iconSvg } from "./svg-string";

// The pictures the map draws in its discs and on its sea, which MapLibre takes as images: the
// web's icons painted with Skia at the phone's density, as the web paints them on a canvas. A
// picture that cannot be painted is left out, and its disc is drawn without it.

// The arrow on the sea is finer than the one that says a direction in a sheet, light with a dark
// edge, so that it reads on every color of the sea without covering it. The web's own.
const SEA_ARROW = { size: 15, ink: "#ffffff", edge: "rgba(0, 0, 0, 0.35)" };
// The arrow in a buoy's disc, in the ink that reads on the disc's color.
const DISC_ARROW = 12;
const INK = { light: "#ffffff", dark: "#0b0b0b" };

/** An SVG painted into a PNG at the phone's density, as an image MapLibre takes. */
function painted(svg: string, size: number): ImageEntry | null {
  const scale = Math.min(3, Math.ceil(PixelRatio.get()));
  const pixels = Math.ceil(size * scale);
  try {
    const dom = Skia.SVG.MakeFromString(svg);
    const surface = Skia.Surface.Make(pixels, pixels);
    if (!dom || !surface) return null;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color("transparent"));
    canvas.drawSvg(dom, pixels, pixels);
    surface.flush();
    const png = surface.makeImageSnapshot().encodeToBase64();
    return { source: { uri: `data:image/png;base64,${png}`, scale } };
  } catch {
    return null;
  }
}

function icon(
  glyph: GlyphIcon,
  size: number,
  inks: IconInk[],
  props?: Record<string, unknown>,
): ImageEntry | null {
  try {
    return painted(iconSvg(glyph, { size, inks, ...(props && { props }) }), size);
  } catch {
    return null;
  }
}

/**
 * The images of the map, in the theme in force: the wave of a break's disc and the pin of a
 * spot's, in the surface's color, which reads on the ink of their discs.
 */
export function mapImages(surface: string): Record<string, ImageEntry> {
  const entries: [string, ImageEntry | null][] = [
    [IMAGES.wave, icon(WaveIcon, DISC_ICON, [{ color: surface }], { strokeWidth: 2 })],
    [IMAGES.pin, icon(PinIcon, DISC_ICON, [{ color: surface }], { strokeWidth: 2 })],
    [
      IMAGES.arrowLight,
      icon(ArrowSymbolUpIcon, DISC_ARROW, [{ color: INK.light }], { strokeWidth: 2.25 }),
    ],
    [
      IMAGES.arrowDark,
      icon(ArrowSymbolUpIcon, DISC_ARROW, [{ color: INK.dark }], { strokeWidth: 2.25 }),
    ],
    [
      IMAGES.seaArrow,
      icon(
        ArrowSymbolUpIcon,
        SEA_ARROW.size,
        [
          // The edge is a wider line under the ink, half a point on each side: the icon's box is
          // 18 of its units wide.
          { color: SEA_ARROW.edge, widen: 18 / SEA_ARROW.size },
          { color: SEA_ARROW.ink },
        ],
        { strokeWidth: 1.5 },
      ),
    ],
  ];
  return Object.fromEntries(
    entries.filter((entry): entry is [string, ImageEntry] => entry[1] !== null),
  );
}

/** Reads a tile of the sea's direction into its gray levels, with Skia: `seaArrowsReader`'s reader. */
export async function readSeaTile(address: string): Promise<Int16Array | null> {
  const response = await fetch(address);
  if (!response.ok) throw new Error(`The direction tile answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!image) return null;
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels || width !== height) return null;
  return levelsOf(pixels);
}
