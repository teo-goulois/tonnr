import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Adds a spot of the account's own, by putting its marker on a map (decision 006). Built by the map work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">new spot</Text>
    </View>
  );
}
