import type { Recent } from "@repo/client/recents";
import { RECENTS_KEY, readRecents, withViewed } from "@repo/client/recents";
import { distanceKm } from "@repo/client/viewer/samples";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";

import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

import { RAISED, isWorthMoving, lowDetent } from "./fold";

// What a place's sheet knows of itself as the platform's sheet: whether it is at rest, so that its
// charts draw (the web's `useChartTurn`), and how tall it stands while low, from the summary of
// its panel (decision 040). And what it says of the place elsewhere: how far it stands from the
// reader, and that it was looked at (decision 042).

type Navigation = NativeStackNavigationProp<Record<string, object | undefined>>;

/**
 * Whether the sheet has come to rest, and at which height: its opening is over, and no finger
 * drags it. iOS says a height once it is reached; Android says whether it is still settling.
 */
export function useSheetState() {
  const navigation = useNavigation<Navigation>();
  const [atRest, setAtRest] = useState(false);
  const [detent, setDetent] = useState(0);
  useEffect(() => {
    const opened = navigation.addListener("transitionEnd", (event) => {
      if (!event.data.closing) setAtRest(true);
    });
    const moved = navigation.addListener("sheetDetentChange", (event) => {
      setDetent(event.data.index);
      setAtRest(event.data.stable);
    });
    // A sheet that says nothing of its opening is at rest once it has had the time to open.
    const timer = setTimeout(() => setAtRest(true), 700);
    return () => {
      opened();
      moved();
      clearTimeout(timer);
    };
  }, [navigation]);
  return { atRest, detent };
}

/**
 * Makes the low sheet as tall as the summary its panel ends at, once it is known: only while the
 * sheet is low, so that a raised sheet is not moved under the reader.
 */
export function useFoldHeight(detent: number) {
  const navigation = useNavigation<Navigation>();
  const { height } = useWindowDimensions();
  const current = useRef<number | undefined>(undefined);
  return (foldBottom: number) => {
    if (detent !== 0) return;
    const low = lowDetent(foldBottom, height);
    if (current.current !== undefined && !isWorthMoving(current.current, low)) return;
    current.current = low;
    navigation.setOptions({ sheetAllowedDetents: [low, RAISED] });
  };
}

/**
 * How far the place stands from the reader, when the phone already lets the app know where it
 * is: the sheet never asks for it.
 */
export function useDistanceFrom(point: { latitude: number; longitude: number } | undefined) {
  const [here, setHere] = useState<{ latitude: number; longitude: number }>();
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { granted } = await Location.getForegroundPermissionsAsync();
        if (!granted) return;
        const last = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
        if (live && last)
          setHere({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      } catch {
        // A phone that cannot say where it is says no distance.
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return here && point ? distanceKm(here, point) : undefined;
}

/**
 * Says that a place was looked at: the phone keeps it at once, as the web's browser does, and the
 * account confirms it, which every device then reads. A spot counts when it is the account's own:
 * one read in a list someone shared is not the reader's to find again.
 */
export function useRecentView(viewed: Recent | undefined) {
  const { signedIn, pending, userId } = useAccount();
  const queryClient = useQueryClient();
  const key = orpc.v1.preferences.getRecents.queryKey();
  const save = useMutation(
    orpc.v1.preferences.saveRecent.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(key, data),
    }),
  );
  const saveView = save.mutate;
  const said = useRef<string>(undefined);
  const kind = viewed?.kind;
  const id = viewed?.id;
  useEffect(() => {
    if (pending || !viewed) return;
    const saying = `${userId ?? ""} ${viewed.kind} ${viewed.id}`;
    if (said.current === saying) return;
    said.current = saying;
    try {
      const kept = readRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null"));
      localStorage.setItem(RECENTS_KEY, JSON.stringify(withViewed(kept, viewed)));
    } catch {
      // A phone that keeps nothing keeps no recent view.
    }
    if (!signedIn) return;
    // An answer on its way would bring back the list as it was.
    void queryClient.cancelQueries({ queryKey: key });
    saveView({ kind: viewed.kind, id: viewed.id });
    // What is open is known by its kind and its id: its name coming again says nothing new.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, signedIn, userId, kind, id]);
}
