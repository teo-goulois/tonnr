import type { SavedList } from "@repo/client/viewer/types";

import { holds, listName } from "@/components/lists/items";
import type { PlaceRef } from "@/components/saved/sea-now";

// What the bookmark of a place reads of the account's lists, and how a list changes at once when
// a place is added to it or taken out, before the API confirms it: the web's `StationActions`
// and its route's `save`. The favorites come first, even before they exist: the API makes them
// with the first thing saved to them, under the id `favorites`. Decision 017. Whether a list
// holds a place and the name a reader sees it by are the lists' own, in `components/lists`.
// Pure, so that a test reads it.

/** The id the API takes for the account's default list, the favorites. */
export const FAVORITES = "favorites";

/** A list the bookmark offers, with whether it holds the place. */
export type ListChoice = { id: string; isDefault: boolean; name: string; checked: boolean };

const IDS = { station: "stationIds", break: "breakIds", spot: "spotIds" } as const;

/** The lists the bookmark offers, the favorites first, as they would be once made. */
export function choicesOf(lists: SavedList[], place: PlaceRef): ListChoice[] {
  const sorted = [...lists.filter((list) => list.isDefault), ...lists.filter((l) => !l.isDefault)];
  const hasFavorites = sorted.some((list) => list.isDefault);
  const favorites = {
    id: FAVORITES,
    isDefault: true,
    name: listName({ name: "", isDefault: true }),
  };
  return [
    ...(hasFavorites ? [] : [{ ...favorites, checked: false }]),
    ...sorted.map((list) => ({
      id: list.id,
      isDefault: list.isDefault,
      name: listName(list),
      checked: holds(list, place),
    })),
  ];
}

/** The lists once a place is added to one or taken out of it, as the screen shows it at once. */
export function withSaved(
  lists: SavedList[],
  listId: string,
  place: PlaceRef,
  add: boolean,
  today = new Date(),
): SavedList[] {
  const key = IDS[place.kind];
  const withPlace = (list: Pick<SavedList, typeof key>) => {
    const others = list[key].filter((other) => other !== place.id);
    return { [key]: add ? [...others, place.id] : others };
  };
  const isTarget = (list: SavedList) =>
    listId === FAVORITES ? list.isDefault : list.id === listId;
  if (!lists.some(isTarget) && listId === FAVORITES && add) {
    const none = { stationIds: [], breakIds: [], spotIds: [] };
    return [
      {
        id: FAVORITES,
        name: "",
        isDefault: true,
        reportsOn: true,
        ...none,
        share: null,
        ...withPlace(none),
        createdAt: today,
        updatedAt: today,
      } as SavedList,
      ...lists,
    ];
  }
  return lists.map((list) => (isTarget(list) ? { ...list, ...withPlace(list) } : list));
}

/** The lists once the API answered one: it takes its place, or the favorites drawn before it. */
export function withAnswered(lists: SavedList[], answered: SavedList): SavedList[] {
  return lists.some((other) => other.id === answered.id)
    ? lists.map((other) => (other.id === answered.id ? answered : other))
    : [answered, ...lists.filter((other) => other.id !== FAVORITES)];
}
