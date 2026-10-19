import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Finds a place by its name, in a sheet with its keyboard (decision 040). Built by the map work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">search</Text>
    </View>
  );
}
