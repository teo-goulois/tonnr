import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Writes a new alert, at `?place=<break|spot>:<id>` or asking where (decision 031). Built by the alerts work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">new alert</Text>
    </View>
  );
}
