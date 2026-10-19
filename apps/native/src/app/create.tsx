import { Text, View } from "react-native";

import { m } from "@/paraglide/messages";

/** What the "+" adds: a session, a spot or an alert (decision 040). */
export default function CreateSheet() {
  return (
    <View className="gap-s bg-background p-l">
      <Text className="font-medium text-l text-foreground">{m.nav_add()}</Text>
    </View>
  );
}
