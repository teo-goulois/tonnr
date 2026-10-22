import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type * as icons from "@repo/ui/icon";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ICON_SAMPLES, ICONS, NOT_DRAWN } from "./icon-samples";
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

  it("leaves out an element the app cannot draw and says so, rather than stopping the screen", () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      function Drawn() {
        return drawTree(
          createElement("svg", null, createElement("foreignObject"), createElement("path")),
          WEB,
          { size: 20, color: "#000" },
        );
      }
      const app = renderToStaticMarkup(createElement(Drawn));
      expect(app).toContain("<path>");
      expect(app).not.toContain("foreignObject");
      expect(said).toHaveBeenCalledWith(expect.stringMatching(/foreignObject/));
    } finally {
      said.mockRestore();
    }
  });

  it("is asked by no screen of the app for an icon it leaves out", () => {
    const source = fileURLToPath(new URL("../..", import.meta.url));
    const asking = readdirSync(source, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const text = readFileSync(join(source, file), "utf8");
        const imported = /import\s*\{([^}]*)\}\s*from\s*"@repo\/ui\/icon"/g;
        return [...text.matchAll(imported)].some(([, names = ""]) =>
          names.split(",").some((name) => NOT_DRAWN.has(name.trim().replace(/^type\s+/, ""))),
        );
      });
    expect(asking).toEqual([]);
  });
});
