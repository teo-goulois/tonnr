import { useLocalSearchParams } from "expo-router";

import { NewAlert } from "@/components/alerts/alert-writer";

/** Writes a new alert, at `?place=<break|spot>:<id>`, from a copy at `?copy=`, or asking where first (decision 031). */
export default function Screen() {
  const { place, copy } = useLocalSearchParams<{ place?: string; copy?: string }>();
  return <NewAlert placeParam={place} copyKey={copy} />;
}
