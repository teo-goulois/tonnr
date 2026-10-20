import type { JoinedList, ListView, SavedList } from "@repo/client/viewer/types";

import { m } from "@/paraglide/messages";

import type { ListChoice } from "@/components/saved/actions";
import type { PlaceRef } from "@/components/saved/sea-now";

// What a list holds, as the screens read it: its places in one order everywhere, its spots,
// then its surf breaks, then its stations, each kind in the order it was added, and its name as
// a reader sees it. A module that reads no React and no phone, so that a test reads it.

/** A list's name as a reader sees it: the favorites under a label of their own. */
export function listName(list: Pick<SavedList, "name" | "isDefault">) {
  return list.isDefault ? m.saved_favorites() : list.name;
}

/** How many places a list holds, of every kind. */
export function sizeOf(list: Pick<SavedList, "spotIds" | "breakIds" | "stationIds">) {
  return list.spotIds.length + list.breakIds.length + list.stationIds.length;
}

/** "1 place", "4 places". */
export function placesCount(count: number) {
  return count === 1 ? m.native_places_one() : m.native_places_some({ count });
}

type Held = {
  spotIds: readonly string[];
  breakIds: readonly string[];
  stationIds: readonly string[];
};

/** The places a list holds, its spots first, then its breaks, then its stations. */
export function refsOf(list: Held): PlaceRef[] {
  return [
    ...list.spotIds.map((id) => ({ kind: "spot" as const, id })),
    ...list.breakIds.map((id) => ({ kind: "break" as const, id })),
    ...list.stationIds.map((id) => ({ kind: "station" as const, id })),
  ];
}

/** What a list read alone holds, by its ids: its spots come whole from `lists.view`. */
export function heldBy(view: ListView): Held {
  return {
    spotIds: view.spots.map((spot) => spot.id),
    breakIds: view.breakIds,
    stationIds: view.stationIds,
  };
}

/** Whether a list holds a place. */
export function holds(list: Held, place: PlaceRef) {
  const ids =
    place.kind === "spot" ? list.spotIds : place.kind === "break" ? list.breakIds : list.stationIds;
  return ids.includes(place.id);
}

/** The account's own lists other than this one, as a choice of where to move a place. */
export function othersOf(lists: readonly SavedList[], listId: string): ListChoice[] {
  return lists
    .filter((list) => list.id !== listId)
    .map((list) => ({ id: list.id, name: listName(list) }));
}

/** A list as the row of chips names it: an own one or one that was kept. */
export type ChipList = { id: string; name: string; shared: boolean };

/** The chips of the saved tab: the account's lists, the favorites first, then those it kept. */
export function chipsOf(lists: readonly SavedList[], joined: readonly JoinedList[]): ChipList[] {
  return [
    ...lists.map((list) => ({ id: list.id, name: listName(list), shared: false })),
    ...joined.map((list) => ({ id: list.id, name: listName(list), shared: true })),
  ];
}
