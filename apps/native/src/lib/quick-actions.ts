import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useEffect } from "react";

import { quickActionItems } from "./quick-action-items";

/**
 * The quick actions of the app's icon: given to the system in the app's language as it starts,
 * which a change of language starts again, and followed to their route when one opens the app or
 * is pressed while it runs. The tabs' layout calls it, since it navigates (decision 074).
 */
export function useQuickActions() {
  useQuickActionRouting();
  useEffect(() => {
    void QuickActions.setItems(quickActionItems()).catch(() => {});
  }, []);
}
