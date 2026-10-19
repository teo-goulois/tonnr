import type * as icons from "@repo/ui/icon";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ICON_SAMPLES, ICONS } from "./icon-samples";
import { drawTree, pointsOf, type SvgRenderer } from "./svg-tree";

// The web's own elements stand for the native ones: what the app would draw is then markup, and
// reads against the icon as the web draws it.
const WEB: SvgRenderer = Object.fromEntries(
  [
    "svg",
    "circle",
    "clipPath",
    "defs",
    "ellipse",
    "g",
    "line",
    "linearGradient",
    "mask",
    "path",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "stop",
  ].map((tag) => [tag, tag]),
) as SvgRenderer;

/** An icon's markup without what the app leaves out: its size, its title, its data and its classes. */
function shapesOf(markup: string) {
  return (
    markup
      .replace(/<title>.*?<\/title>/g, "")
      .replace(
        /\s(?:width|height|xmlns|class|color|data-[\w-]+|aria-[\w-]+|accessible|accessibilitylabel)="[^"]*"/gi,
        "",
      )
      .replace(/\sstyle="[^"]*"/g, "")
      // A glyph names its clips and masks after React's useId, which differs from one render to
      // the next.
      .replace(/surf-([a-z]+)-[\w-]+/g, "surf-$1")
  );
}

describe("an icon of the web, drawn by the app", () => {
  it("finds every icon of @repo/ui/icon", () => {
    expect(ICONS.length).toBeGreaterThan(100);
  });

  it.each(ICONS)("draws %s with the same shapes as the web", (name, Icon) => {
    const props = (ICON_SAMPLES[name] ?? {}) as icons.IconProps;
    const web = renderToStaticMarkup(createElement(Icon, props));
    function Drawn() {
      return drawTree(Icon(props), WEB, { size: 24, color: "#123456" });
    }
    const app = renderToStaticMarkup(createElement(Drawn));

    expect(shapesOf(app)).toBe(shapesOf(web));
    expect(app).toContain('width="24"');
  });

  it("reads a length the web writes in pixels or em", () => {
    expect(pointsOf("20px", 0)).toBe(20);
    expect(pointsOf(18, 0)).toBe(18);
    expect(pointsOf("1em", 20)).toBe(20);
  });

  it("refuses an element the app cannot draw, so that no icon goes missing in silence", () => {
    expect(() =>
      drawTree(createElement("svg", null, createElement("foreignObject")), WEB, {
        size: 20,
        color: "#000",
      }),
    ).toThrow(/foreignObject/);
  });
});
