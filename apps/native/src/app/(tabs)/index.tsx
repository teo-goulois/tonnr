import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { orpc } from "@/utils/orpc";

/** The map. For now, what the API answers a visitor of the app, to prove the way there. */
export default function MapScreen() {
  const stations = useQuery(orpc.v1.stations.list.queryOptions({ input: {} }));
  return (
    <View className="flex-1 items-center justify-center bg-background p-l">
      <Text className="font-medium text-l text-foreground">Tonnr</Text>
      <Text className="mt-xs text-m text-muted">
        {stations.isPending
          ? "…"
          : stations.isError
            ? stations.error.message
            : `${stations.data.stations.length} stations`}
      </Text>
    </View>
  );
}
