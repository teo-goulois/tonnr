import { type ReactNode, useRef } from "react";
import { View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
  SwipeDirection,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";

// A row of a list that a swipe acts on, as a mail program's: from the leading edge for what is
// done most, from the trailing one for what removes it. The action is done as the row comes to
// rest open, which a touch says, and the row closes again. A screen reader reaches the same
// actions through the row's own, which the row names: the swipe is a shortcut and never the only
// way. Chosen here.

/** How wide an action stands as a row is pulled. */
const ACTION_WIDTH = 96;

export type SwipeAct = {
  label: string;
  icon: GlyphIcon;
  /** What it does, in a color: what is done most, what waits, or what removes. */
  tone: "accent" | "warning" | "danger";
  onAct: () => void;
};

function ActionPanel({
  act,
  side,
  progress,
}: {
  act: SwipeAct;
  side: "leading" | "trailing";
  progress: SharedValue<number>;
}) {
  const { colors, space } = useTheme();
  const ground =
    act.tone === "danger"
      ? colors.error
      : act.tone === "warning"
        ? colors.warning
        : colors["color-1"];
  const ink =
    act.tone === "warning"
      ? light["neutral-10"]
      : act.tone === "danger"
        ? light["neutral-1"]
        : colors["neutral-1"];
  // The action's sign grows in as the row is pulled, and stands whole once it would act.
  const grows = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get()),
    transform: [{ scale: 0.7 + 0.3 * Math.min(1, progress.get()) }],
  }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: ACTION_WIDTH,
        backgroundColor: ground,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: side === "leading" ? "flex-start" : "flex-end",
        height: "100%",
      }}
    >
      <Animated.View style={[{ alignItems: "center", gap: space.xxs }, grows]}>
        <Glyph icon={act.icon} size={20} color={ink} />
        <Text size="xs" weight="medium" dense numberOfLines={1} style={{ color: ink }}>
          {act.label}
        </Text>
      </Animated.View>
    </View>
  );
}

type SwipeRowProps = {
  leading?: SwipeAct | undefined;
  trailing?: SwipeAct | undefined;
  children: ReactNode;
};

/** A row that a swipe acts on. */
export function SwipeRow({ leading, trailing, children }: SwipeRowProps) {
  const swipeable = useRef<SwipeableMethods>(null);
  const { colors } = useTheme();
  if (!leading && !trailing) return children;
  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.5}
      overshootFriction={8}
      leftThreshold={ACTION_WIDTH * 0.6}
      rightThreshold={ACTION_WIDTH * 0.6}
      containerStyle={{ backgroundColor: colors["neutral-3"] }}
      renderLeftActions={
        leading
          ? (progress) => <ActionPanel act={leading} side="leading" progress={progress} />
          : undefined
      }
      renderRightActions={
        trailing
          ? (progress) => <ActionPanel act={trailing} side="trailing" progress={progress} />
          : undefined
      }
      onSwipeableWillOpen={() => feel("select")}
      onSwipeableOpen={(direction) => {
        // The row moved right: what stands at its leading edge was pulled into view.
        const act = direction === SwipeDirection.RIGHT ? leading : trailing;
        swipeable.current?.close();
        act?.onAct();
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
