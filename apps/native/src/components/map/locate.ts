import { APP_NAME } from "@repo/config/app";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

import { useTell } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";

import { MINUTE_MS } from "./queries";
import type { MapPoint } from "./view";

// Where the reader is, as the map's button finds it: the phone asks leave the first time the
// button is pressed, and never before. Once it was given, the map draws the phone's own dot. A
// reader who refused is told where to give it.

/** Whether the phone may say where the reader is, and what finds them. */
export function useLocate() {
  const tell = useTell();
  const [located, setLocated] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  useEffect(() => {
    void Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (permission.granted) setLocated(true);
      })
      .catch(() => {});
  }, []);

  /**
   * Where the reader is, once the phone says it, or nothing when it cannot. `precise` asks the
   * phone where it is now, to put a spot, where the map takes where it was a moment ago.
   */
  async function locate({ precise = false } = {}): Promise<MapPoint | undefined> {
    setIsLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        tell({
          title: m.native_locate_denied({ name: APP_NAME }),
          tone: "danger",
          action: { label: m.native_open_settings(), onPress: () => void Linking.openSettings() },
        });
        return undefined;
      }
      const position =
        (precise ? null : await Location.getLastKnownPositionAsync({ maxAge: 5 * MINUTE_MS })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
        }));
      setLocated(true);
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      tell({ title: m.locate_failed(), tone: "danger" });
      return undefined;
    } finally {
      setIsLocating(false);
    }
  }

  return { located, isLocating, locate };
}
