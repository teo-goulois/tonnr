import {
  BASEMAP_NAME_WIDTH,
  BASEMAP_SOURCE,
  firstLabelOf,
  isBasemapName,
} from "@repo/client/map/view";

// OpenFreeMap's basemap as the map is given it: its style, read once for each theme and changed as
// the web changes it once loaded, its names given the web's width, and what the map draws its own
// layers among, the first of its names, and whose data it is, which its tiles' description says
// as HTML. A module that imports nothing of React Native, so that a test reads it.

/** A layer of a style, as much of it as is read here. */
type StyleLayer = {
  id: string;
  type: string;
  source?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

/** A style of MapLibre, as much of it as is read here. */
export type BasemapStyle = {
  sources: Record<string, { type: string; url?: string }>;
  layers: StyleLayer[];
};

export type Basemap = {
  /** The style, with the web's width for the names. */
  style: BasemapStyle;
  /** The first layer of names, under which the arrows of the sea are drawn: a name reads over them. */
  firstLabel: string | undefined;
  /** The color of the land and of the water, which the land drawn over the sea takes. */
  land: string | undefined;
  water: string | undefined;
  /** The address of the description of the basemap's tiles, which says whose data they are. */
  tiles: string | undefined;
};

const colorOf = (layer: StyleLayer | undefined, property: string) => {
  const color = layer?.paint?.[property];
  return typeof color === "string" ? color : undefined;
};

/** Reads a style that came as JSON, or nothing when it is not one. */
export function readBasemap(json: unknown): Basemap | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const { sources, layers } = json as Partial<BasemapStyle>;
  if (typeof sources !== "object" || sources === null || !Array.isArray(layers)) return undefined;
  const named = layers.map((layer) =>
    isBasemapName(layer)
      ? { ...layer, layout: { ...layer.layout, "text-max-width": BASEMAP_NAME_WIDTH } }
      : layer,
  );
  return {
    style: { ...(json as BasemapStyle), layers: named },
    firstLabel: firstLabelOf(layers),
    land: colorOf(
      layers.find((layer) => layer.id === "background"),
      "background-color",
    ),
    water: colorOf(
      layers.find((layer) => layer.id === "water"),
      "fill-color",
    ),
    tiles: sources[BASEMAP_SOURCE]?.url,
  };
}

/** A piece of the map's credits: words, which lead somewhere when they have an address. */
export type CreditPart = { text: string; href?: string };

/** OpenFreeMap's own credits, as its tiles say them, for a map that could not read them. */
export const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>';

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
};

function decoded(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1] === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

const words = (html: string) => decoded(html.replace(/<[^>]*>/g, ""));

/**
 * The credits as their source writes them in HTML, read into words and the links among them: a
 * link of the web's own leads to its address, and any other mark is left out.
 */
export function creditParts(html: string): CreditPart[] {
  const parts: CreditPart[] = [];
  const link = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let from = 0;
  for (const found of html.matchAll(link)) {
    const before = words(html.slice(from, found.index));
    if (before) parts.push({ text: before });
    const href = decoded(found[1] ?? found[2] ?? "");
    const text = words(found[3] ?? "");
    if (text) parts.push(/^https?:\/\//i.test(href) ? { text, href } : { text });
    from = found.index + found[0].length;
  }
  const after = words(html.slice(from));
  if (after) parts.push({ text: after });
  return parts;
}

/** Everyone's credits, one after the other, as the web's map writes them. */
export function joinedCredits(sources: readonly (readonly CreditPart[])[]): CreditPart[] {
  return sources
    .filter((parts) => parts.length > 0)
    .flatMap((parts, index) => (index === 0 ? parts : [{ text: " | " }, ...parts]));
}
