import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Logs a session, at `?place=<break|spot>:<id>` or asking where (decision 043). Built by the sessions work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">new session</Text>
    </View>
  );
}
