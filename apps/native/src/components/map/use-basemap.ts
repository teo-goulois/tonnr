import { STYLE_URLS } from "@repo/client/map/view";
import { useQuery } from "@tanstack/react-query";

import { BASEMAP_ATTRIBUTION, readBasemap } from "./basemap";

// The basemap's style and the description of its tiles, asked of OpenFreeMap once for each theme
// and kept while the app runs: the map, the sheets that add or move a spot and the credits read
// one answer.

async function json(address: string): Promise<unknown> {
  const response = await fetch(address);
  if (!response.ok) throw new Error(`The basemap answered ${response.status}`);
  return response.json();
}

/**
 * The basemap of a theme, read from its style. Pending while the style comes; none once it could
 * not be read, and the map then reads the style from its address as it is.
 */
export function useBasemap(scheme: "light" | "dark") {
  return useQuery({
    queryKey: ["basemap", scheme],
    queryFn: async () => {
      const basemap = readBasemap(await json(STYLE_URLS[scheme]));
      if (!basemap) throw new Error("The basemap's style is not one");
      return basemap;
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

/** Whose data the basemap draws, as its tiles say it in HTML, or as OpenFreeMap wrote it. */
export function useBasemapAttribution(scheme: "light" | "dark") {
  const tiles = useBasemap(scheme).data?.tiles;
  const description = useQuery({
    queryKey: ["basemap-tiles", tiles],
    queryFn: () => json(tiles!),
    enabled: tiles !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const attribution = (description.data as { attribution?: unknown } | undefined)?.attribution;
  return typeof attribution === "string" ? attribution : BASEMAP_ATTRIBUTION;
}
