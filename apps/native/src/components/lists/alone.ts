import { TAB_ROUTES } from "@/components/map/place-route";

// The list the map shows alone, as its route among the tabs says it: one of the account's by its
// id, `?list=`, or one opened by its link, `?shared=`, which comes first, as on the web
// (decision 035). The saved tab, the tabs' bar and the wall of a closed instance read it from the
// tabs' navigator, whatever tab is in view. A module that imports nothing of React Native, so that
// a test reads it.

/** A route of the tabs' navigator. */
export type TabRoute = { key: string; name: string; params?: object | undefined };
/** The state of the tabs' navigator. */
export type TabsState = { key: string; index: number; routes: readonly TabRoute[] } | undefined;

/** What the map shows alone: a list by its link, or one of the account's by its id. */
export type Alone = { shared: string } | { list: string };

/** The map's route among the tabs: `app/(tabs)/index.tsx`. */
export function mapRouteOf(state: TabsState) {
  return state?.routes.find((route) => route.name === TAB_ROUTES.map);
}

/** The list a route of the map shows alone, as its parameters say it, or none. */
export function aloneOf(params: object | undefined): Alone | undefined {
  const { list, shared } = (params ?? {}) as { list?: unknown; shared?: unknown };
  if (typeof shared === "string" && shared) return { shared };
  if (typeof list === "string" && list) return { list };
  return undefined;
}

/** The parameters that show a list alone on the map, or everything with none: the link goes. */
export function showingParams(id: string | undefined) {
  return { list: id, shared: undefined };
}
