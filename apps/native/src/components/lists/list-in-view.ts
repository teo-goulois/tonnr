import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";

// The list shown alone, which the map and the saved tab show together, as the web keeps one
// `?list=` for both whatever tab is in view (`tabSearch` in packages/client/src/phone-nav.ts):
// the map's own `?list=`, which the map reads and its chips change. The saved tab reads it from
// the tabs' navigator, follows it as it changes, and changes it with its own chips, so that a
// list chosen in one is the list of the other (decisions 035 and 040).

/** The map's route in the tabs' navigator: `app/(tabs)/index.tsx`. */
const MAP_ROUTE = "index";

type Route = { key: string; name: string; params?: object | undefined };
type TabsState = { routes: readonly Route[] } | undefined;

function mapRouteOf(state: TabsState) {
  return state?.routes.find((route) => route.name === MAP_ROUTE);
}

function listOf(route: Route | undefined) {
  const list = (route?.params as { list?: unknown } | undefined)?.list;
  return typeof list === "string" && list ? list : undefined;
}

/** The list the map shows alone, and what shows another, or everything again with none. */
export function useListInView() {
  // The navigation of the saved tab's route among the tabs, whose state holds the map's.
  const tabs = useNavigation("/(tabs)");
  const [list, setList] = useState(() => listOf(mapRouteOf(tabs.getState() as TabsState)));

  useEffect(
    () =>
      tabs.addListener("state", () => setList(listOf(mapRouteOf(tabs.getState() as TabsState)))),
    [tabs],
  );

  const show = useCallback(
    (id: string | undefined) => {
      const map = mapRouteOf(tabs.getState() as TabsState);
      if (!map) return;
      setList(id);
      // The map's parameters, set from another tab: `router.setParams` sets the focused route's.
      tabs.dispatch({ type: "SET_PARAMS", payload: { params: { list: id } }, source: map.key });
    },
    [tabs],
  );

  return { list, show };
}
