import { ArrowSymbolUpIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { describe, expect, it } from "vitest";

import type { GlyphIcon } from "@/components/shared/glyph";

import { iconSvg } from "./svg-string";

describe("an icon written as an SVG for the map", () => {
  it("keeps the icon's box and lines, in the ink asked for", () => {
    const svg = iconSvg(WaveIcon as GlyphIcon, {
      size: 13,
      inks: [{ color: "#ffffff" }],
      props: { strokeWidth: 2 },
    });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="13" height="13"/);
    expect(svg).toContain('viewBox="0 0 18 18"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toContain("data-color");
    expect(svg.match(/<path /g)?.length).toBe(2);
  });

  it("draws an edge as a wider line of another color under the ink", () => {
    const svg = iconSvg(ArrowSymbolUpIcon as GlyphIcon, {
      size: 15,
      inks: [{ color: "rgba(0, 0, 0, 0.35)", widen: 1.2 }, { color: "#ffffff" }],
      props: { strokeWidth: 1.5 },
    });
    const edge = svg.indexOf('stroke="rgba(0, 0, 0, 0.35)"');
    const ink = svg.indexOf('stroke="#ffffff"');
    expect(edge).toBeGreaterThan(0);
    expect(ink).toBeGreaterThan(edge);
    expect(svg).toContain('stroke-width="2.7"');
    expect(svg).toContain('stroke-width="1.5"');
  });

  it("writes a line's ends as SVG names them", () => {
    const svg = iconSvg(ArrowSymbolUpIcon as GlyphIcon, { size: 12, inks: [{ color: "#000" }] });
    expect(svg).toContain('<line x1="9" y1="2.75" x2="9" y2="15.25"');
    expect(iconSvg(PinIcon as GlyphIcon, { size: 13, inks: [{ color: "#000" }] })).toContain(
      'stroke-linejoin="round"',
    );
  });
});
