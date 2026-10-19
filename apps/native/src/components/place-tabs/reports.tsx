import { View } from "react-native";

import { Text } from "@/components/ui/text";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/** The reports of the waves at a break (decisions 067 and 068). Built by the sessions work: decision 069. */
export function ReportsTab({ kind, id }: PlaceTabProps) {
  return (
    <View className="p-l">
      <Text tone="muted">{`ReportsTab ${kind} ${id}`}</Text>
    </View>
  );
}
