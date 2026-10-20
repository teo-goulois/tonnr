import { CheckIcon, ChevronLeftIcon } from "@repo/ui/icon";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// What a long press on a place opens on Android: Material's modal bottom sheet of actions, each
// a row of 56 points with its icon, over a dimmed screen that a press or the back button
// closes. iOS opens the system's context menu instead, with the place's preview over it. The
// sheet rises on the theme's larger motion, which Reanimated holds still for a reader who asked
// for no motion; the dimmed screen fades.

const ITEM = 56;

export type SheetItem = {
  key: string;
  label: string;
  icon: GlyphIcon;
  destructive?: boolean;
  /** Marks the choice that stands, as the list that holds the place now. */
  checked?: boolean;
  onPress: () => void;
};

export type SheetContent = {
  title: string;
  /** A step back to the sheet before, as from the lists to move to back to the actions. */
  onBack?: () => void;
  items: readonly SheetItem[];
};

export function ActionSheet({
  content,
  onClose,
}: {
  content: SheetContent | null;
  onClose: () => void;
}) {
  const { colors, space, radius, motion } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={content !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => (content?.onBack ? content.onBack() : onClose())}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.action_close()}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0 0 0 / 0.4)" }]}
        />
        {content ? (
          <Animated.View
            key={content.title}
            entering={SlideInDown.duration(motion.largeDuration)}
            accessibilityViewIsModal
            style={{
              backgroundColor: colors["neutral-1"],
              borderTopLeftRadius: radius.s,
              borderTopRightRadius: radius.s,
              paddingTop: space.xs,
              paddingBottom: insets.bottom + space.xs,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 32,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors["neutral-5"],
                marginBottom: space.xs,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: ITEM,
                paddingHorizontal: content.onBack ? space.xs : space.m,
                gap: space.xxs,
              }}
            >
              {content.onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={m.action_back()}
                  onPress={content.onBack}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Glyph icon={ChevronLeftIcon} size={20} color={colors["neutral-10"]} />
                </Pressable>
              ) : null}
              <Text
                weight="medium"
                accessibilityRole="header"
                numberOfLines={2}
                style={{ flex: 1 }}
              >
                {content.title}
              </Text>
            </View>
            {content.items.map((item) => {
              const color = item.destructive ? colors.error : colors["neutral-10"];
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={
                    item.checked === undefined ? undefined : { checked: item.checked }
                  }
                  android_ripple={{ color: colors["neutral-3"] }}
                  onPress={() => {
                    feel("select");
                    item.onPress();
                  }}
                  style={{
                    minHeight: ITEM,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.m,
                    paddingHorizontal: space.m,
                  }}
                >
                  <Glyph icon={item.icon} size={20} color={color} />
                  <Text style={{ flex: 1, color }}>{item.label}</Text>
                  {item.checked ? (
                    <Glyph icon={CheckIcon} size={16} color={colors["neutral-7"]} />
                  ) : null}
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
