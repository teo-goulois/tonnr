import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Chooses a new password, from the link of that mail, `?token=` (decisions 026 and 070). Built by the account work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">reset password</Text>
    </View>
  );
}
