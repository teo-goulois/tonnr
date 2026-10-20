import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

import {
  createSeaNowLoader,
  type PlaceRef,
  type PlacesNow,
  type PlacesNowInput,
  type Told,
} from "./sea-now";

// The sea now at a place, for a row that shows it: each place is a query of its own, kept under
// whoever reads it, and the places asked in one moment leave together in calls of twelve
// (decision 074). A call counts one forecast question of the caller's hour, so a place is read
// again after five minutes at the soonest, or when the screen is pulled to refresh.

/** Who reads the places, which says what a spot answers: an account, a visitor, or a list's link. */
export type SeaReader = {
  /** Kept with each place, so that what one reader was answered is never shown to another. */
  key: string;
  ask: (input: PlacesNowInput) => Promise<PlacesNow>;
};

/** What every query of the sea now is kept under: a pull to refresh reads them all again. */
export const SEA_NOW_KEY = "places-now";
const STALE_MS = 5 * 60 * 1000;

const loaders = new Map<string, (ref: PlaceRef) => Promise<Told>>();

function loaderOf(reader: SeaReader) {
  let load = loaders.get(reader.key);
  if (!load) {
    load = createSeaNowLoader(reader.ask);
    loaders.set(reader.key, load);
  }
  return load;
}

function seaNowOptions(reader: SeaReader, ref: PlaceRef) {
  return {
    queryKey: [SEA_NOW_KEY, reader.key, ref.kind, ref.id] as const,
    queryFn: () => loaderOf(reader)(ref),
    staleTime: STALE_MS,
  };
}

/** The account that is signed in, or a visitor, who reads the breaks and the stations alone. */
export function useAccountReader(): SeaReader {
  const { userId } = useAccount();
  return useMemo(
    () => ({
      key: userId ?? "visitor",
      ask: (input: PlacesNowInput) => orpc.v1.places.now.call(input),
    }),
    [userId],
  );
}

/** The sea now at each of these places, in their order. `data` is null for a place the answer left out. */
export function useSeaNows(reader: SeaReader, refs: readonly PlaceRef[]) {
  return useQueries({ queries: refs.map((ref) => seaNowOptions(reader, ref)) });
}
