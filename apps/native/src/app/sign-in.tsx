import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Signs in or creates an account, `?reason=` says what for (decisions 039 and 070). Built by the account work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">sign in</Text>
    </View>
  );
}
