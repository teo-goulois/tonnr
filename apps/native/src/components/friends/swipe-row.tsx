import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

// A row of a list that a swipe from its end opens on what can be done with it, as a phone's own
// lists do: end a friendship, block, unblock. A swipe is no way for everyone: the row also says
// the same actions to a screen reader (`accessibilityActions`), and has a press that reaches them.

export type SwipeAction = { label: string; destructive?: boolean; onPress: () => void };

/** How wide each action stands once the row is open. */
const ACTION_WIDTH = 92;

export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={() => feel("select")}
      // The row covers its actions while it is closed: it stands on the surface of its list.
      childrenContainerStyle={{ backgroundColor: colors["cte-surface"] }}
      renderRightActions={(_progress, _translation, swipeable) => (
        <View style={{ flexDirection: "row" }}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                swipeable.close();
                action.onPress();
              }}
              style={({ pressed }) => ({
                width: ACTION_WIDTH,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: space.xs,
                backgroundColor: action.destructive ? colors.error : colors["neutral-4"],
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                size="s"
                weight="medium"
                dense
                numberOfLines={2}
                style={{
                  textAlign: "center",
                  color: action.destructive ? colors["neutral-1"] : colors["neutral-10"],
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

/** The actions of a row as a screen reader offers them, and what each does. */
export function accessibleActions(actions: SwipeAction[]) {
  return {
    accessibilityActions: actions.map((action, index) => ({
      name: `action-${index}`,
      label: action.label,
    })),
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      const index = Number(event.nativeEvent.actionName.replace("action-", ""));
      actions[index]?.onPress();
    },
  };
}
