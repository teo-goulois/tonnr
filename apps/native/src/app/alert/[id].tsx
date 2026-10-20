import { useLocalSearchParams } from "expo-router";

import { SavedAlert } from "@/components/alerts/alert-writer";

/** Changes an alert of the account (decision 031). */
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SavedAlert id={id} />;
}
