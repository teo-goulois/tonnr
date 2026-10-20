import type { SavedItem, SavedList } from "@repo/client/viewer/types";

// What the bookmark of a place reads of the account's lists, and how a list changes at once when
// a place is added to it or taken out, before the API confirms it: the web's `StationActions`
// and its route's `save`. The favorites come first, even before they exist: the API makes them
// with the first thing saved to them, under the id `favorites`. Decision 017. Pure, so that a
// test reads it.

/** The id the API takes for the account's default list, the favorites. */
export const FAVORITES = "favorites";

/** Whether a list holds a station, a surf break or a spot. */
export function holds(
  list: Pick<SavedList, "stationIds" | "breakIds" | "spotIds">,
  item: SavedItem,
) {
  if ("spotId" in item) return list.spotIds.includes(item.spotId);
  return "breakId" in item
    ? list.breakIds.includes(item.breakId)
    : list.stationIds.includes(item.stationId);
}

/** A list the bookmark offers, with whether it holds the place. */
export type ListChoice = { id: string; isDefault: boolean; name: string; checked: boolean };

/**
 * The lists the bookmark offers, the favorites first, as they would be once made. `favorites`
 * names the default list in the reader's language.
 */
export function choicesOf(lists: SavedList[], item: SavedItem, favorites: string): ListChoice[] {
  const sorted = [...lists.filter((list) => list.isDefault), ...lists.filter((l) => !l.isDefault)];
  const hasFavorites = sorted.some((list) => list.isDefault);
  return [
    ...(hasFavorites ? [] : [{ id: FAVORITES, isDefault: true, name: favorites, checked: false }]),
    ...sorted.map((list) => ({
      id: list.id,
      isDefault: list.isDefault,
      name: list.isDefault ? favorites : list.name,
      checked: holds(list, item),
    })),
  ];
}

/** The lists once a place is added to one or taken out of it, as the screen shows it at once. */
export function withSaved(
  lists: SavedList[],
  listId: string,
  item: SavedItem,
  add: boolean,
  today = new Date(),
): SavedList[] {
  const changed = (ids: string[], id: string) =>
    add ? [...ids.filter((other) => other !== id), id] : ids.filter((other) => other !== id);
  const withItem = (list: Pick<SavedList, "stationIds" | "breakIds" | "spotIds">) =>
    "spotId" in item
      ? { spotIds: changed(list.spotIds, item.spotId) }
      : "breakId" in item
        ? { breakIds: changed(list.breakIds, item.breakId) }
        : { stationIds: changed(list.stationIds, item.stationId) };
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
        ...withItem(none),
        createdAt: today,
        updatedAt: today,
      } as SavedList,
      ...lists,
    ];
  }
  return lists.map((list) => (isTarget(list) ? { ...list, ...withItem(list) } : list));
}

/** The lists once the API answered one: it takes its place, or the favorites drawn before it. */
export function withAnswered(lists: SavedList[], answered: SavedList): SavedList[] {
  return lists.some((other) => other.id === answered.id)
    ? lists.map((other) => (other.id === answered.id ? answered : other))
    : [answered, ...lists.filter((other) => other.id !== FAVORITES)];
}
