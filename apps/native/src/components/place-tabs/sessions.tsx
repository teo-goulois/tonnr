import { View } from "react-native";

import { Text } from "@/components/ui/text";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/** The sessions the account surfed at a place, and what it likes there (decision 043). Built by the sessions work: decision 069. */
export function SessionsTab({ kind, id }: PlaceTabProps) {
  return (
    <View className="p-l">
      <Text tone="muted">{`SessionsTab ${kind} ${id}`}</Text>
    </View>
  );
}
