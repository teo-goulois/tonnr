import type { PlaceKind } from "@/components/map/features";

// The tabs of a place's sheet, as the web's `Details` gives them to each kind: a station has its
// forecast alone; a surf break its forecast, the reports of its waves, its guide, the account's
// alerts there and the sessions surfed there; a spot of the account's own its forecast, its
// guide, its alerts and its sessions, and a spot read in a shared list its forecast and its
// guide. Decisions 041, 043, 064 and 067. Pure, so that a test reads it.

export type { PlaceKind };
const PLACE_KINDS: readonly PlaceKind[] = ["break", "station", "spot"];

export type PlaceTab = "forecast" | "reports" | "guide" | "alerts" | "sessions";

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === "string" && (PLACE_KINDS as readonly string[]).includes(value);
}

/** The tabs a place shows, in their order. */
export function tabsOf({
  kind,
  signedIn,
  isOwner,
}: {
  kind: PlaceKind;
  signedIn: boolean;
  // Whether a spot is the account's own. A break and a station belong to everyone.
  isOwner: boolean;
}): PlaceTab[] {
  if (kind === "station") return ["forecast"];
  if (kind === "break") {
    // A visitor has no alert: the sessions' tab asks it for an account.
    return ["forecast", "reports", "guide", ...(signedIn ? (["alerts"] as const) : []), "sessions"];
  }
  return ["forecast", "guide", ...(isOwner ? (["alerts", "sessions"] as const) : [])];
}

/**
 * The tab an address asks for, when the place has it: `?tab=` takes the web's names, and the
 * web's `alert` is the alerts' tab. Otherwise the forecast.
 */
export function tabFrom(asked: unknown, tabs: readonly PlaceTab[]): PlaceTab {
  const named = asked === "alert" ? "alerts" : asked;
  return tabs.find((tab) => tab === named) ?? "forecast";
}
