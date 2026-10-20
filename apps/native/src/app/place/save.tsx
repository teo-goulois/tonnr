import type { SavedItem } from "@repo/client/viewer/types";
import { useLocalSearchParams } from "expo-router";

import { SaveToLists } from "@/components/place/save-lists";
import { isPlaceKind } from "@/components/place/tabs";

/** What the bookmark of a place opens: the account's lists, `/place/save?kind=&id=&name=`. Decision 017. */
export default function Screen() {
  const { kind, id, name } = useLocalSearchParams<{ kind?: string; id?: string; name?: string }>();
  if (!isPlaceKind(kind) || !id) return null;
  const item: SavedItem =
    kind === "station" ? { stationId: id } : kind === "break" ? { breakId: id } : { spotId: id };
  return <SaveToLists item={item} name={name ?? ""} />;
}
