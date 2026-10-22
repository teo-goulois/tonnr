import { useLocalSearchParams } from "expo-router";

import { MoveSpot } from "@/components/place/move-spot";

/** Renames a spot of the account's own and moves it on a map, `/place/move?id=`. Decision 006. */
export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return null;
  return <MoveSpot id={id} />;
}
