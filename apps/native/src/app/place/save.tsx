import { useLocalSearchParams } from "expo-router";

import { SaveToLists } from "@/components/place/save-lists";
import { isPlaceKind } from "@/components/place/tabs";

/** What the bookmark of a place opens: the account's lists, `/place/save?kind=&id=&name=`. Decision 017. */
export default function Screen() {
  const { kind, id, name } = useLocalSearchParams<{ kind?: string; id?: string; name?: string }>();
  if (!isPlaceKind(kind) || !id) return null;
  return <SaveToLists place={{ kind, id }} name={name ?? ""} />;
}
