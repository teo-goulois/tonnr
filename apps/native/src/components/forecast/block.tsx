import type { ReactNode } from "react";
import { View } from "react-native";

import { SMALL } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

/** A part of the panel: its title, with on its right the controls of what it heads. */
export function Block({
  title,
  control,
  children,
}: {
  title: string;
  control?: ReactNode;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      {/* As tall as the small button a control is, so that one that comes and goes moves nothing
          under it. The controls keep their width, as the web's do, and a title too long for what
          is left goes on to its next line. */}
      <View
        style={{
          minHeight: SMALL,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.s,
        }}
      >
        <Text weight="medium" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {control && (
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: space.xxs, flexShrink: 0 }}
          >
            {control}
          </View>
        )}
      </View>
      {children}
    </View>
  );
}
