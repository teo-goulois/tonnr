import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Changes an alert of the account (decision 031). Built by the alerts work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">alert</Text>
    </View>
  );
}
