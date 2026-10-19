import { View } from "react-native";

import { Text } from "@/components/ui/text";

/** A place, as a sheet over the map: a surf break, a station or a spot of the account's own, `/place/<break|station|spot>/<id>?tab=forecast|guide|reports|sessions|alerts`. Built by the place work: decision 069. */
export default function Screen() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text tone="muted">place</Text>
    </View>
  );
}
