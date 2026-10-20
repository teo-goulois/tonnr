import { useEffect, useState } from "react";
import { AppState } from "react-native";

const MINUTE_MS = 60 * 1000;

/**
 * The time, read again each minute and when the app comes back to the screen: a reading on the
 * map or in a place's sheet ages with it, and what says "16 min ago" or which day a window falls
 * on follows it. The one clock of the screens.
 */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    const listening = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      listening.remove();
    };
  }, []);
  return now;
}
