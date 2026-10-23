import { type SkCanvas, Skia } from "@shopify/react-native-skia";
import { PixelRatio } from "react-native";

import { iconSvg } from "@/components/map/svg-string";
import type { GlyphIcon } from "@/components/shared/glyph";

// The pictures the app paints for a native view that takes an image and draws no component: the
// symbols of MapLibre (`map-images.ts`) and the art of the bar of tabs. An icon of
// `@repo/ui/icon` is written as an SVG (`svg-string.ts`) and painted with Skia into a PNG at the
// phone's density, in a data address, as the web paints one on a canvas: nothing of a drawing is
// committed (decision 069). A picture that cannot be painted is null, and whoever asked for it
// draws without it.

/** A painted picture: a PNG in a data address, with the density it was painted at. */
export type PaintedImage = { source: { uri: string; scale: number } };

/** Paints what `draw` draws on a square `box` points wide into a PNG at the phone's density. */
function paint(box: number, draw: (canvas: SkCanvas) => void): PaintedImage | null {
  const scale = Math.min(3, Math.ceil(PixelRatio.get()));
  const pixels = Math.ceil(box * scale);
  try {
    const surface = Skia.Surface.Make(pixels, pixels);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color("transparent"));
    // An SVG says its size in points, which Skia keeps whatever box it is drawn in: the canvas is
    // scaled to the density, or the picture would fill a third of its image at three pixels to
    // the point, and MapLibre would draw it a third of its size, in its corner.
    canvas.scale(pixels / box, pixels / box);
    draw(canvas);
    surface.flush();
    const png = surface.makeImageSnapshot().encodeToBase64();
    return { source: { uri: `data:image/png;base64,${png}`, scale } };
  } catch {
    return null;
  }
}

/** An SVG painted into a PNG at the phone's density, as an image MapLibre takes. */
export function painted(svg: string, size: number): PaintedImage | null {
  try {
    const dom = Skia.SVG.MakeFromString(svg);
    if (!dom) return null;
    return paint(size, (canvas) => canvas.drawSvg(dom, size, size));
  } catch {
    return null;
  }
}

/**
 * An icon painted in one color, `size` points wide in the middle of a square `box` points wide,
 * which a bar of tabs widens to the size of its own box, and over a disc of the color `disc` when
 * one is given.
 */
export function paintedIcon(
  icon: GlyphIcon,
  {
    size,
    box = size,
    color,
    disc,
    props,
  }: {
    size: number;
    box?: number;
    color: string;
    disc?: string;
    props?: Record<string, unknown>;
  },
): PaintedImage | null {
  try {
    const dom = Skia.SVG.MakeFromString(
      iconSvg(icon, { size, inks: [{ color }], ...(props && { props }) }),
    );
    if (!dom) return null;
    return paint(box, (canvas) => {
      if (disc) {
        const ground = Skia.Paint();
        ground.setAntiAlias(true);
        ground.setColor(Skia.Color(disc));
        canvas.drawCircle(box / 2, box / 2, box / 2, ground);
      }
      canvas.translate((box - size) / 2, (box - size) / 2);
      canvas.drawSvg(dom, size, size);
    });
  } catch {
    return null;
  }
}
