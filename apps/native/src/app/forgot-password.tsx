import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** Asks for the mail that lets a new password be chosen (decision 026). Built by the account work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">forgot password</Text>
    </View>
  );
}
