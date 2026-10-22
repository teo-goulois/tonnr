import type { Station } from "@repo/client/viewer/types";
import { useQueries } from "@tanstack/react-query";

import { codeOf, retryUnlessGone } from "@/components/lists/items";
import { orpc } from "@/utils/orpc";

import type { PlaceItem } from "./place-actions";
import type { PlaceRef } from "./sea-now";

// The places a list names by their ids, as its rows show them, read as the web's route reads
// them (apps/web/src/routes/app/index.tsx): a surf break by `breaks.get` for its name, a station
// by `stations.get` for its name and what it read last, and a spot by the name the screen already
// has, the account's own or those of the list read alone. None of them counts a forecast question
// (decision 053). A place the API says is no more, a break merged away or a spot deleted, leaves
// no row; one whose answer is on its way, or did not come, waits in its row's place, as on the
// web, until it is read again.

/** A row of a list: a place with its name, and a station with what it read; or one still read. */
export type SavedRow =
  | { key: string; item: PlaceItem; station?: Station | undefined }
  | { key: string; waiting: true };

const keyOf = (ref: PlaceRef) => `${ref.kind}:${ref.id}`;

type Reading = {
  /** The names of the spots the screen knows, by id. */
  spots: ReadonlyMap<string, string>;
  /** Whether those are all of them: a spot it does not know is then no more. */
  spotsKnown: boolean;
  /**
   * Holds what the API is told while a call is made, as a list read by its link must be
   * (decision 035): it answers what lets go of it.
   */
  hold?: (() => () => void) | undefined;
};

/** The rows of these places, in their order. */
export function useSavedPlaces(
  refs: readonly PlaceRef[],
  { spots, spotsKnown, hold }: Reading,
): SavedRow[] {
  const stationIds = [...new Set(refs.flatMap((ref) => (ref.kind === "station" ? [ref.id] : [])))];
  const breakIds = [...new Set(refs.flatMap((ref) => (ref.kind === "break" ? [ref.id] : [])))];
  const held = async <Answer>(call: () => Promise<Answer>) => {
    const release = hold?.();
    try {
      return await call();
    } finally {
      release?.();
    }
  };

  const stations = useQueries({
    queries: stationIds.map((id) => ({
      ...orpc.v1.stations.get.queryOptions({ input: { id } }),
      ...(hold && { queryFn: () => held(() => orpc.v1.stations.get.call({ id })) }),
      retry: retryUnlessGone,
    })),
  });
  const breaks = useQueries({
    queries: breakIds.map((id) => ({
      ...orpc.v1.breaks.get.queryOptions({ input: { id } }),
      ...(hold && { queryFn: () => held(() => orpc.v1.breaks.get.call({ id })) }),
      retry: retryUnlessGone,
    })),
  });

  return refs.flatMap((ref): SavedRow[] => {
    const key = keyOf(ref);
    if (ref.kind === "spot") {
      const name = spots.get(ref.id);
      if (name !== undefined) return [{ key, item: { ref, name } }];
      return spotsKnown ? [] : [{ key, waiting: true }];
    }
    const query =
      ref.kind === "station"
        ? stations[stationIds.indexOf(ref.id)]
        : breaks[breakIds.indexOf(ref.id)];
    if (query?.data) {
      const station = ref.kind === "station" ? (query.data as Station) : undefined;
      return [{ key, item: { ref, name: query.data.name }, station }];
    }
    if (query?.isError && codeOf(query.error) === "NOT_FOUND") return [];
    return [{ key, waiting: true }];
  });
}
