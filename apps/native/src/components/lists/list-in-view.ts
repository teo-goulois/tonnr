import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { aloneOf, mapRouteOf, showingParams, type TabsState } from "./alone";

// The list shown alone, which the map and the saved tab show together, as the web keeps one
// `?list=` for both whatever tab is in view (`tabSearch` in packages/client/src/phone-nav.ts):
// the map's own `?list=`, which the map reads and its chips change. The saved tab reads it from
// the tabs' navigator, follows it as it changes, and changes it with its own chips, so that a
// list chosen in one is the list of the other (decisions 035 and 040). A list chosen there
// takes the place of one the map shows by its link, `?shared=`, as the map's own chips do.

/** What the map shows alone, by its route among the tabs. */
function inViewOf(state: TabsState) {
  const alone = aloneOf(mapRouteOf(state)?.params);
  return {
    list: alone && "list" in alone ? alone.list : undefined,
    shared: alone && "shared" in alone ? alone.shared : undefined,
  };
}

/**
 * The list the map shows alone, or the link of the one it shows by its link, and what shows
 * another, or everything again with none.
 */
export function useListInView() {
  // The navigation of the saved tab's route among the tabs, whose state holds the map's.
  const tabs = useNavigation("/(tabs)");
  const [inView, setInView] = useState(() => inViewOf(tabs.getState() as TabsState));

  useEffect(
    () => tabs.addListener("state", () => setInView(inViewOf(tabs.getState() as TabsState))),
    [tabs],
  );

  const show = useCallback(
    (id: string | undefined) => {
      const map = mapRouteOf(tabs.getState() as TabsState);
      if (!map) return;
      setInView({ list: id, shared: undefined });
      // The map's parameters, set from another tab: `router.setParams` sets the focused route's.
      tabs.dispatch({
        type: "SET_PARAMS",
        payload: { params: showingParams(id) },
        source: map.key,
      });
    },
    [tabs],
  );

  return { ...inView, show };
}
