import { useLocalSearchParams } from "expo-router";

import { PlaceMenu } from "@/components/place/place-menu";
import { isPlaceKind } from "@/components/place/tabs";

/** What is seldom done with a place, `/place/menu?kind=&id=`: an alert, a share, the way there, a spot's own actions. Decisions 034, 056 and 064. */
export default function Screen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  if (!isPlaceKind(kind) || !id) return null;
  return <PlaceMenu kind={kind} id={id} />;
}
