import { useLocalSearchParams } from "expo-router";

import { SaveToLists } from "@/components/place/save-lists";
import { isPlaceKind } from "@/components/place/tabs";

/** What the bookmark of a place opens: the account's lists, `/place/save?kind=&id=`. Decision 017. */
export default function Screen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  if (!isPlaceKind(kind) || !id) return null;
  return <SaveToLists place={{ kind, id }} />;
}
