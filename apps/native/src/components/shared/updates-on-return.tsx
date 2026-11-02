import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useTheme } from "@/lib/theme";
import { onReturn } from "@/lib/updates";

/**
 * Asks for an update of the JavaScript as the app comes back to the screen, and runs one that was
 * downloaded as it comes back after a quarter of an hour away, on the theme's ground for the
 * moment it takes: decision 075. Nothing in a development build, which takes no update.
 */
export function UpdatesOnReturn() {
  const { isUpdatePending } = Updates.useUpdates();
  const { colors } = useTheme();
  // Read as the app comes back, without listening again at each change.
  const pending = useRef(isUpdatePending);
  pending.current = isUpdatePending;
  const ground = useRef(colors["cte-canvas"]);
  ground.current = colors["cte-canvas"];

  useEffect(() => {
    if (!Updates.isEnabled) return;
    let leftAt: number | null = null;
    // `expo-updates` asked as the app started.
    let askedAt = Date.now();
    let asking = false;
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        leftAt = Date.now();
        return;
      }
      if (state !== "active") return;
      const now = Date.now();
      const next = onReturn({ now, leftAt, askedAt, pending: pending.current });
      leftAt = null;
      if (next === "reload") {
        void Updates.reloadAsync({
          reloadScreenOptions: {
            backgroundColor: ground.current,
            spinner: { enabled: false },
            fade: true,
          },
        }).catch(() => {});
      } else if (next === "ask" && !asking) {
        asking = true;
        askedAt = now;
        void (async () => {
          const found = await Updates.checkForUpdateAsync();
          if (found.isAvailable || found.isRollBackToEmbedded) await Updates.fetchUpdateAsync();
        })()
          // No network, or a server that does not answer: the next return asks again.
          .catch(() => {})
          .finally(() => {
            asking = false;
          });
      }
    });
    return () => listening.remove();
  }, []);

  return null;
}
