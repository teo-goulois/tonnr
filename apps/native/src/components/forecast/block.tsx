import type { ReactNode } from "react";
import { View } from "react-native";

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
      {/* As tall as a control, so that one that comes and goes moves nothing under it. */}
      <View
        style={{
          minHeight: 36,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: space.s,
        }}
      >
        <Text weight="medium" accessibilityRole="header">
          {title}
        </Text>
        {control && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
            {control}
          </View>
        )}
      </View>
      {children}
    </View>
  );
}
