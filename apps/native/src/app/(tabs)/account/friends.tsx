import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** The account's link, its code, and its friends (decision 041). Built by the community work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">friends</Text>
    </View>
  );
}
