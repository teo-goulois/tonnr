import { View } from "react-native";

import { Text } from "@/components/ui/text";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/** The alerts of the account at a place (decisions 031 and 064). Built by the alerts work: decision 069. */
export function AlertsTab({ kind, id }: PlaceTabProps) {
  return (
    <View className="p-l">
      <Text tone="muted">{`AlertsTab ${kind} ${id}`}</Text>
    </View>
  );
}
