import type { AlertDraft } from "@repo/client/alerts/alert-words";

// What a new alert starts from when it is the copy of another: the draft as it was written, with
// its places named, handed from the screen that copies to the sheet that writes it. An address
// carries its key alone, so that nothing of the alert goes into it. Kept while the app runs: a
// copy whose app was closed since starts as an alert of its own. Decision 031.

/** A place of an alert, with what the editor reads of it. */
export type AlertPlace = {
  kind: "spot" | "break";
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type Copy = { draft: AlertDraft; places: AlertPlace[] };

const copies = new Map<string, Copy>();
let made = 0;

/** Keeps a copy, and answers the key an address names it by. */
export function keepCopy(copy: Copy) {
  made += 1;
  const key = String(made);
  copies.set(key, copy);
  return key;
}

/**
 * The copy a key names. It stays: a screen reads it as often as it is drawn, and a copy is a few
 * figures.
 */
export function readCopy(key: string | undefined) {
  return key === undefined ? undefined : copies.get(key);
}

/** The places of an alert as the API names them. */
export function placesOfAlert(alert: {
  places: {
    spotId: string | null;
    breakId: string | null;
    name: string;
    latitude: number;
    longitude: number;
  }[];
}): AlertPlace[] {
  return alert.places.flatMap<AlertPlace>(({ spotId, breakId, name, latitude, longitude }) => {
    if (spotId) return [{ kind: "spot", id: spotId, name, latitude, longitude }];
    if (breakId) return [{ kind: "break", id: breakId, name, latitude, longitude }];
    return [];
  });
}

/** Reads `<kind>:<id>`, as `?place=` writes a place. */
export function readPlace(param: string | string[] | undefined) {
  const text = Array.isArray(param) ? param[0] : param;
  const [kind, id] = text?.split(":") ?? [];
  if ((kind === "spot" || kind === "break") && id) return { kind, id } as const;
  return undefined;
}
