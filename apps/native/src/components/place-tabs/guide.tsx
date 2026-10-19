import { View } from "react-native";

import { Text } from "@/components/ui/text";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/** The guide of a surf break, written by the accounts (decision 041). Built by the community work: decision 069. */
export function GuideTab(_: PlaceTabProps) {
  return (
    <View className="p-l">
      <Text tone="muted">GuideTab</Text>
    </View>
  );
}
