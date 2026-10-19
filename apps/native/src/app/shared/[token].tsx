import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** A list opened by its link, `/l/<token>` on the web (decision 035). Built by the saved work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">shared list</Text>
    </View>
  );
}
