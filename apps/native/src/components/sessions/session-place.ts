import type { SessionPlace } from "@repo/client/sessions/types";
import { type Href, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

// Where a session is, as the app's routes name it: `place=<break|spot>:<id>`, which a place's tab
// and a link write, and the name it is shown with, asked of the API when the route does not give
// it. Decision 043.

/** The place a route names, or null when it names none a session can be at. */
export function placeOfParam(param: string | undefined): Pick<SessionPlace, "kind" | "id"> | null {
  const at = param?.indexOf(":") ?? -1;
  if (!param || at < 0) return null;
  const kind = param.slice(0, at);
  const id = param.slice(at + 1);
  if ((kind === "break" || kind === "spot") && id) return { kind, id };
  return null;
}

/** A place as a route names it. */
export const placeParam = (place: Pick<SessionPlace, "kind" | "id">) => `${place.kind}:${place.id}`;

/**
 * A place as the API knows it: its name, as the route gave it or as the API answers it, a break of
 * the catalogue by anyone and a spot by its owner alone, undefined while it is asked; and whether
 * the API said there is none, for a spot that is another's, which a shared list shows.
 */
export function usePlaceKnown(place: Pick<SessionPlace, "kind" | "id"> | null, given?: string) {
  const { signedIn } = useAccount();
  const atBreak = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: place?.id ?? "" },
      enabled: !given && place?.kind === "break",
      select: (found) => found.name,
      retry: false,
    }),
  );
  // A spot is asked even when its name is given: whether it is the account's says what it takes.
  const atSpot = useQuery(
    orpc.v1.spots.get.queryOptions({
      input: { id: place?.id ?? "" },
      enabled: signedIn && place?.kind === "spot",
      select: (found) => found.name,
      retry: false,
    }),
  );
  const asked = place?.kind === "spot" ? atSpot : atBreak;
  return { name: given ?? asked.data, isMissing: asked.isError };
}

/** The name of a place, as the route gave it or as the API answers it. */
export function usePlaceName(place: Pick<SessionPlace, "kind" | "id"> | null, given?: string) {
  return usePlaceKnown(place, given).name;
}

/**
 * Opens a place on the map, as a press on its marker does: the map's tab first, then the place's
 * sheet over it. A place of the log is read where it is surfed.
 */
export function openPlaceOnMap(href: Href) {
  router.navigate("/");
  router.push(href);
}
