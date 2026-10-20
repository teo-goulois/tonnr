import type { ReactNode } from "react";
import { useRef } from "react";
import { Pressable, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A row of a list with one action behind it, which a swipe to the left uncovers, as a phone's
// lists do: the action is in the theme's red when it takes something away. A swipe is found by
// those who look for it, and a screen reader does not swipe, so the row's own press offers the
// same action: whoever holds this row gives it that press.

type SwipeRowProps = {
  children: ReactNode;
  /** What the action says, on its button and to a screen reader. */
  actionLabel: string;
  onAction: () => void;
  destructive?: boolean;
};

export function SwipeRow({ children, actionLabel, onAction, destructive = true }: SwipeRowProps) {
  const { colors, space } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => feel("hold")}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            swipeable.current?.close();
            onAction();
          }}
          style={{
            justifyContent: "center",
            paddingHorizontal: space.m,
            backgroundColor: destructive ? colors.error : colors["neutral-4"],
          }}
        >
          <Text weight="medium" style={{ color: destructive ? colors["neutral-1"] : undefined }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    >
      <View style={{ backgroundColor: colors["cte-surface"] }}>{children}</View>
    </ReanimatedSwipeable>
  );
}
