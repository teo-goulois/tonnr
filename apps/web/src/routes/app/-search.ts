import { fold } from "@repo/config/names";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { Found, PlaceSearching } from "@/components/viewer/place-search";
import type { Spot, Station } from "@/components/viewer/types";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

// How long the search waits after the last key before it asks.
const WAIT_MS = 250;
// The catalogue is asked from this many characters, and the places from one more: fewer find
// the whole world.
const SEARCH_FROM = 2;
const PLACES_FROM = 3;
// How many it shows of each kind.
const BREAKS_MOST = 8;
const OWN_MOST = 5;
const PLACES_MOST = 4;
const MINUTE_MS = 60 * 1000;

// The nearest places first, as an address is read.
const whereOf = (location: string[] | null | undefined) =>
  [...(location ?? [])].reverse().slice(0, 3).join(", ") || undefined;

type Asked = {
  // Nothing is asked of the API while the search is not in view.
  isOn: boolean;
  // Where the map is: what is near comes first.
  near: { latitude: number; longitude: number; zoom?: number } | undefined;
  // What the screen holds already, which is searched as it is typed: the account's own spots and
  // the buoys. Left out, none is looked for.
  spots?: Spot[] | undefined;
  stations?: Station[] | undefined;
  // The places by their name are an account's to ask: decision 030.
  withPlaces: boolean;
};

/**
 * A search of the map by a name: the account's own spots, the breaks of the catalogue, the buoys
 * and, for an account, the places a search service names. Each search keeps what is typed in it.
 */
export function usePlaceSearch({ isOn, near, spots, stations, withPlaces }: Asked): PlaceSearching {
  const [query, setQuery] = useState("");
  // What is asked, once the keys have stopped, and where the map was then.
  const [asked, setAsked] = useState<{ q: string; near: Asked["near"] }>({
    q: "",
    near: undefined,
  });
  // A search that is left starts over when it comes back.
  if (!isOn && query !== "") setQuery("");
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => setAsked({ q, near }), WAIT_MS);
    return () => clearTimeout(timer);
    // The map moving asks nothing again: a search is made from where the map was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const typed = query.trim();
  const isSearchable = isOn && typed.length >= SEARCH_FROM;
  // Only what is still typed is asked and shown. While the keys have not stopped, the answer is
  // on its way.
  const isAsking = isSearchable && asked.q === typed;
  const isWaiting = isSearchable && asked.q !== typed;
  const point = asked.near && {
    latitude: asked.near.latitude,
    longitude: asked.near.longitude,
  };
  const breaks = useQuery(
    orpc.v1.breaks.search.queryOptions({
      input: { q: asked.q, ...point, limit: BREAKS_MOST },
      enabled: isAsking,
      staleTime: 10 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  const asksPlaces = isAsking && withPlaces && typed.length >= PLACES_FROM;
  const places = useQuery(
    orpc.v1.places.search.queryOptions({
      input: { q: asked.q, ...asked.near, locale: getLocale(), limit: PLACES_MOST },
      enabled: asksPlaces,
      // The API asks a service that is not the instance's: one request for a search, and no more.
      retry: false,
      staleTime: 10 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );

  // What the screen holds is read as the catalogue is: whatever the case and the marks.
  const read = isSearchable ? fold(typed) : "";
  const ownSpots = useMemo<Found[]>(
    () =>
      read
        ? (spots ?? [])
            .filter((one) => fold(one.name).includes(read))
            .slice(0, OWN_MOST)
            .map((one) => ({
              kind: "spot",
              id: one.id,
              name: one.name,
              latitude: one.latitude,
              longitude: one.longitude,
            }))
        : [],
    [spots, read],
  );
  const buoys = useMemo<Found[]>(
    () =>
      read
        ? (stations ?? [])
            .filter((one) => fold(one.name).includes(read))
            .slice(0, OWN_MOST)
            .map((one) => ({
              kind: "station",
              id: one.id,
              name: one.name,
              latitude: one.latitude,
              longitude: one.longitude,
            }))
        : [],
    [stations, read],
  );
  const foundBreaks = useMemo<Found[]>(
    () =>
      isAsking
        ? (breaks.data?.breaks ?? []).map((one) => ({
            kind: "break",
            id: one.id,
            name: one.name,
            where: whereOf(one.location),
            latitude: one.latitude,
            longitude: one.longitude,
          }))
        : [],
    [isAsking, breaks.data],
  );
  const foundPlaces = useMemo<Found[]>(
    () =>
      asksPlaces
        ? (places.data?.places ?? []).map((one) => ({
            kind: "place",
            name: one.name,
            where: whereOf(one.location),
            latitude: one.latitude,
            longitude: one.longitude,
          }))
        : [],
    [asksPlaces, places.data],
  );

  return {
    query,
    onQueryChange: setQuery,
    isSearching: isSearchable,
    spots: ownSpots,
    breaks: foundBreaks,
    stations: buoys,
    places: foundPlaces,
    isPending: isWaiting || (isAsking && breaks.isLoading) || (asksPlaces && places.isLoading),
    // The catalogue is the instance's own: when it does not answer, the search has failed. The
    // places are a service's, and what else was found still shows without them.
    isError: isAsking && breaks.isError,
    credit: asksPlaces ? places.data?.source.attribution : undefined,
  };
}
