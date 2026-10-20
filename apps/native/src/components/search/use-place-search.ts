import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { MINUTE_MS } from "@/components/map/queries";
import { getLocale } from "@/paraglide/runtime";
import { orpc } from "@/utils/orpc";

import {
  BREAKS_MOST,
  type Found,
  goesOn,
  matching,
  PLACES_FROM,
  PLACES_MOST,
  SEARCH_FROM,
  WAIT_MS,
  whereOf,
} from "./found";

type Asked = {
  // Where the map is: what is near comes first.
  near: { latitude: number; longitude: number; zoom?: number } | undefined;
  // What the screen holds already, which is searched as it is typed: the account's own spots and
  // the buoys. Left out, none is looked for.
  spots?: readonly { id: string; name: string; latitude: number; longitude: number }[] | undefined;
  stations?:
    | readonly { id: string; name: string; latitude: number; longitude: number }[]
    | undefined;
  // The places by their name are an account's to ask: decision 030.
  withPlaces: boolean;
};

/** A search of the map by a name, as a screen draws it. */
export type PlaceSearching = {
  query: string;
  onQueryChange: (query: string) => void;
  // True once enough is typed to search.
  isSearching: boolean;
  spots: Found[];
  breaks: Found[];
  stations: Found[];
  places: Found[];
  isPending: boolean;
  isError: boolean;
  // Whose the places are, to say under them.
  credit: string | undefined;
};

/**
 * A search of the map by a name: the account's own spots, the breaks of the catalogue, the buoys
 * and, for an account, the places a search service names. The web's `usePlaceSearch`: what the
 * search before found stays until the next answer comes, so that the list never empties and fills
 * again at each key.
 */
export function usePlaceSearch({ near, spots, stations, withPlaces }: Asked): PlaceSearching {
  const [query, setQuery] = useState("");
  // What is asked, once the keys have stopped, and where the map was then.
  const [asked, setAsked] = useState<{ q: string; near: Asked["near"] }>({
    q: "",
    near: undefined,
  });
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => setAsked({ q, near }), WAIT_MS);
    return () => clearTimeout(timer);
    // The map moving asks nothing again: a search is made from where the map was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const typed = query.trim();
  const isSearchable = typed.length >= SEARCH_FROM;
  // Only what is still typed is asked and shown. While the keys have not stopped, the answer is
  // on its way.
  const isAsking = isSearchable && asked.q === typed;
  const isWaiting = isSearchable && asked.q !== typed;
  const point = asked.near && { latitude: asked.near.latitude, longitude: asked.near.longitude };
  // The answer before stays in view when what is typed goes on from it. The search a query asked
  // for is the input in its key.
  const keeping = <Answer>(previous: Answer | undefined, before?: { queryKey: unknown }) => {
    const key = before?.queryKey as [unknown, { input?: { q?: string } }] | undefined;
    const was = key?.[1]?.input?.q ?? "";
    return asked.q.length >= SEARCH_FROM && goesOn(was, asked.q) ? previous : undefined;
  };
  const breaks = useQuery(
    orpc.v1.breaks.search.queryOptions({
      input: { q: asked.q, ...point, limit: BREAKS_MOST },
      enabled: isAsking,
      placeholderData: keeping,
      staleTime: 10 * MINUTE_MS,
    }),
  );
  const asksPlaces = isAsking && withPlaces && typed.length >= PLACES_FROM;
  const places = useQuery(
    orpc.v1.places.search.queryOptions({
      input: { q: asked.q, ...asked.near, locale: getLocale(), limit: PLACES_MOST },
      enabled: asksPlaces,
      placeholderData: keeping,
      // The API asks a service that is not the instance's: one request for a search, and no more.
      retry: false,
      staleTime: 10 * MINUTE_MS,
    }),
  );

  const ownSpots = useMemo(
    () => (isSearchable ? matching("spot", spots ?? [], typed) : []),
    [spots, typed, isSearchable],
  );
  const buoys = useMemo(
    () => (isSearchable ? matching("station", stations ?? [], typed) : []),
    [stations, typed, isSearchable],
  );
  // Shown while the keys have not stopped too: it is what the search before found.
  const foundBreaks = useMemo<Found[]>(
    () =>
      isSearchable
        ? (breaks.data?.breaks ?? []).map((one) => ({
            kind: "break",
            id: one.id,
            name: one.name,
            where: whereOf(one.location),
            latitude: one.latitude,
            longitude: one.longitude,
          }))
        : [],
    [isSearchable, breaks.data],
  );
  const showsPlaces = isSearchable && withPlaces && typed.length >= PLACES_FROM;
  const foundPlaces = useMemo<Found[]>(
    () =>
      showsPlaces
        ? (places.data?.places ?? []).map((one) => ({
            kind: "place",
            name: one.name,
            where: whereOf(one.location),
            latitude: one.latitude,
            longitude: one.longitude,
          }))
        : [],
    [showsPlaces, places.data],
  );

  return {
    query,
    onQueryChange: setQuery,
    isSearching: isSearchable,
    spots: ownSpots,
    breaks: foundBreaks,
    stations: buoys,
    places: foundPlaces,
    // An answer that is kept from the search before is still one that is waited for.
    isPending: isWaiting || (isAsking && breaks.isFetching) || (asksPlaces && places.isFetching),
    // The catalogue is the instance's own: when it does not answer, the search has failed. The
    // places are a service's, and what else was found still shows without them.
    isError: isAsking && breaks.isError,
    credit: showsPlaces ? places.data?.source.attribution : undefined,
  };
}
