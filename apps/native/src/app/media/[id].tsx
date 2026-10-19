import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** A photo or a video, over the whole screen (decision 066). Built by the sessions work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">media</Text>
    </View>
  );
}
