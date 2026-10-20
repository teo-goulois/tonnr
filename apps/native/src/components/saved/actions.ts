import type { PlaceKind, PlaceRef } from "./sea-now";

// What a place's row offers, on a long press and to a screen reader: open it, move it to
// another of the account's lists, set an alert there, send it, take it out of the list. Which
// of them a row has depends on the place and on where it stands, never on how it is shown. A
// module that reads no React and no phone, so that a test reads it.

export type ActionKey = "open" | "move" | "alert" | "share" | "remove";

/** One of the account's own lists, by its id and the name a reader sees. */
export type ListChoice = { id: string; name: string };

/** Where a row stands, which says what may be done with its place there. */
export type RowContext = {
  /** The account's own list the row stands in: the place can be taken out of it, or moved. */
  list?: ListChoice;
  /** The account's other lists, which it can be moved to. */
  others?: readonly ListChoice[];
  /**
   * Whether the place is the account's to set an alert on: a break of the catalogue, or a spot
   * of the account's own (decision 064). A spot of a list someone shared is its owner's.
   */
  ownSpot?: boolean;
};

/** Whether an alert can be set at a place: a break, or a spot of the account's own. */
export function isAlertable(kind: PlaceKind, ownSpot: boolean) {
  return kind === "break" || (kind === "spot" && ownSpot);
}

/** What a row offers, in the order a menu lists it. */
export function actionsOf(place: PlaceRef, context: RowContext): ActionKey[] {
  const keys: ActionKey[] = ["open"];
  if (context.list && (context.others?.length ?? 0) > 0) keys.push("move");
  if (isAlertable(place.kind, context.ownSpot ?? false)) keys.push("alert");
  // A spot of an account's own is sent in a shared list, never by an address of its own.
  if (place.kind !== "spot") keys.push("share");
  if (context.list) keys.push("remove");
  return keys;
}
