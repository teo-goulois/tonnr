// What the map draws, which its legend switches on and off, and the phone keeps as the browser
// keeps it: the colored sea (decision 018), the arrows on it, the buoys, the wind stations and the
// surf breaks. The account's own spots have no switch. A module that imports nothing at run time,
// so that a test reads it.

export type MapLayers = {
  sea: boolean;
  // Arrows on the sea, which point the way the waves go.
  arrows: boolean;
  buoys: boolean;
  wind: boolean;
  breaks: boolean;
};

/** The web's own: the wind stations are many, and wait to be asked for. */
export const DEFAULT_LAYERS: MapLayers = {
  sea: true,
  arrows: true,
  buoys: true,
  wind: false,
  breaks: true,
};

/** What the phone keeps them under, as the browser does. */
export const LAYERS_KEY = "tonnr:map-layers";

/** The layers a phone kept, or none when it kept nothing this app wrote. */
export function readLayers(stored: unknown): MapLayers | null {
  if (typeof stored !== "object" || stored === null) return null;
  const { sea, arrows, buoys, wind, breaks } = stored as Record<string, unknown>;
  return typeof sea === "boolean" && typeof buoys === "boolean" && typeof wind === "boolean"
    ? // A choice kept from before the breaks or the arrows were on the map says nothing of them.
      {
        sea,
        arrows: typeof arrows === "boolean" ? arrows : DEFAULT_LAYERS.arrows,
        buoys,
        wind,
        breaks: typeof breaks === "boolean" ? breaks : DEFAULT_LAYERS.breaks,
      }
    : null;
}

/** The layers kept as text, or the web's own when the text says nothing this app wrote. */
export function layersFrom(text: string | null | undefined): MapLayers {
  try {
    return readLayers(JSON.parse(text ?? "null")) ?? DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}

/**
 * What a list shown alone is drawn with: everything it holds, whatever the switches say, as the
 * web draws it. The sea keeps its own switches.
 */
export function layersForList(layers: MapLayers): MapLayers {
  return { ...layers, buoys: true, wind: true, breaks: true };
}
