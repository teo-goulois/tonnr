import { fold } from "@repo/config/names";

// What a search of the map by a name finds, and how it reads what is typed: the web's
// `usePlaceSearch` and `PlaceSearch` (decision 040). A name is read whatever its case and its
// marks, as the API reads the catalogue's. A module that imports nothing of React Native, so that
// a test reads it.

/**
 * Something a search found: a spot of the account's own, a break of the catalogue, a buoy, or a
 * place by its name, which has no id and no sheet (decision 030).
 */
export type Found = {
  kind: "spot" | "break" | "station" | "place";
  id?: string;
  name: string;
  // Where it lies, the nearest place first. Left out when the instance does not say.
  where?: string | undefined;
  latitude: number;
  longitude: number;
};

/** The catalogue is asked from this many characters, and the places from one more. */
export const SEARCH_FROM = 2;
export const PLACES_FROM = 3;
/** How long the search waits after the last key before it asks. */
export const WAIT_MS = 250;
/** How many it shows of each kind. */
export const BREAKS_MOST = 8;
export const OWN_MOST = 5;
export const PLACES_MOST = 4;

/**
 * Whether what is typed goes on from what was asked before, or back to it: "cap" then "capb", or
 * the other way. The answer before then stays in view until the next comes.
 */
export function goesOn(before: string, after: string) {
  const [one, other] = [fold(before), fold(after)];
  return one.length >= SEARCH_FROM && (other.startsWith(one) || one.startsWith(other));
}

/** Where something lies, the nearest places first, as an address is read. */
export function whereOf(location: readonly string[] | null | undefined) {
  return [...(location ?? [])].reverse().slice(0, 3).join(", ") || undefined;
}

/** What the screen holds already whose name holds what is typed, read as the catalogue is. */
export function matching(
  kind: "spot" | "station",
  candidates: readonly { id: string; name: string; latitude: number; longitude: number }[],
  typed: string,
): Found[] {
  const read = fold(typed.trim());
  if (read.length < SEARCH_FROM) return [];
  return candidates
    .filter((one) => fold(one.name).includes(read))
    .slice(0, OWN_MOST)
    .map((one) => ({
      kind,
      id: one.id,
      name: one.name,
      latitude: one.latitude,
      longitude: one.longitude,
    }));
}

/** A key for a thing found, which a list keeps it by. */
export function keyOf(found: Found) {
  return `${found.kind} ${found.id ?? `${found.name}:${found.latitude},${found.longitude}`}`;
}
