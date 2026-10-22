import { useLocalSearchParams } from "expo-router";

import { PublishSpot } from "@/components/place/publish-spot";

/** Asks that a spot of the account's own be made public, `/place/publish?id=`. Decision 034. */
export default function Screen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return null;
  return <PublishSpot id={id} />;
}
