import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
} from "expo-location";
import { useEffect, useMemo, useState } from "react";

import { type OfferedPlace, useOfferedPlaces } from "./place-picker";
import { nearestPlace } from "./session-logic";

// Where a new session most likely was: the account's spot or the break it looked at last that is
// nearest the phone. The phone is asked nothing it was not allowed to say already, by the map that
// finds the reader or a report: a session is written on the way out of the water, and a question
// then would stand between the surfer and the log. Decision 043.

type Point = { latitude: number; longitude: number };

// How long the phone may take to say where it is before the session asks where instead.
const WAIT_MS = 2500;
// A position the phone kept is good enough when it is this recent: the surfer is still on the beach.
const KEPT_MS = 20 * 60 * 1000;

/** Where the phone is, roughly and soon, when it is allowed to say. Null otherwise. */
async function roughPosition(): Promise<Point | null> {
  try {
    const { status } = await getForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const kept = await getLastKnownPositionAsync({ maxAge: KEPT_MS }).catch(() => null);
    if (kept) return kept.coords;
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
    const fresh = getCurrentPositionAsync({ accuracy: Accuracy.Balanced }).catch(() => null);
    const found = await Promise.race([fresh, late]);
    return found?.coords ?? null;
  } catch {
    return null;
  }
}

/**
 * The place nearest the phone among those a session is offered, once the phone said where it is
 * and the places are known. `settled` is false while either is awaited; `phone` is where it is,
 * which a search of breaks brings forward.
 */
export function useNearestPlace(wanted: boolean) {
  const offered = useOfferedPlaces();
  const [phone, setPhone] = useState<Point | null | undefined>(wanted ? undefined : null);

  useEffect(() => {
    if (!wanted) return;
    let isLive = true;
    void roughPosition().then((found) => {
      if (isLive) setPhone(found ? { latitude: found.latitude, longitude: found.longitude } : null);
    });
    return () => {
      isLive = false;
    };
  }, [wanted]);

  const settled = phone === null || (phone !== undefined && !offered.isPending);
  const place = useMemo<OfferedPlace | null>(
    () => (settled ? nearestPlace([...offered.spots, ...offered.breaks], phone ?? null) : null),
    [settled, offered.spots, offered.breaks, phone],
  );
  return { place, settled, phone: phone ?? null };
}
