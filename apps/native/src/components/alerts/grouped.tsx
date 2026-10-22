import type { ReactNode } from "react";
import { View } from "react-native";

import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/lib/theme";

// A list grouped as the platform's settings group one, inset from the screen's edges: each row a
// cell of the theme's surface, the first and the last rounded at the theme's smallest radius, a
// line between two of them. The rows of a list that scrolls by itself are drawn one at a time, so
// each says where it stands. The kit's `Section` holds its rows at once; this is the same look
// for such a list. The alerts' tab draws its rows plain, as the web's panel does.

export function GroupedCell({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: ReactNode;
}) {
  const { colors, space, radius } = useTheme();
  const corner = radius.xs;
  return (
    <View style={{ paddingHorizontal: space.m }}>
      <View
        style={{
          backgroundColor: colors["cte-surface"],
          overflow: "hidden",
          borderCurve: "continuous",
          borderTopLeftRadius: first ? corner : 0,
          borderTopRightRadius: first ? corner : 0,
          borderBottomLeftRadius: last ? corner : 0,
          borderBottomRightRadius: last ? corner : 0,
        }}
      >
        {children}
        {last ? null : <Separator inset={space.m} />}
      </View>
    </View>
  );
}
