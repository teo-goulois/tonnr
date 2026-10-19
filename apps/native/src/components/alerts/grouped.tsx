import type { ReactNode } from "react";
import { View } from "react-native";

import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A list grouped as the platform's settings group one, inset from the screen's edges: each row a
// cell of the theme's surface, the first and the last rounded at the theme's smallest radius, a
// line between two of them. The rows of a SectionList are drawn one at a time, so each says
// where it stands. The kit's `Section` holds its rows at once; this is the same look for a list
// that scrolls by itself.

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

/** The title of a group, which stays at the top while its rows scroll under it. */
export function GroupTitle({ title }: { title: string }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors["cte-canvas"],
        paddingHorizontal: space.m + space.m,
        paddingTop: space.m,
        paddingBottom: space.xs,
      }}
    >
      <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** The dot of what is not read, which a screen reader says in words. */
export function UnreadDot({ unread }: { unread: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        marginTop: 6,
        backgroundColor: unread ? colors["color-1"] : "transparent",
      }}
    />
  );
}
