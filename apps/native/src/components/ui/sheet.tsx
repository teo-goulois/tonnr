import { type NavigationAction, useNavigation, usePreventRemove } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Button } from "./button";
import { Text } from "./text";

// What a screen needs to be a form sheet: its options are `formSheet` (sheet-options.ts), given
// to its `Stack.Screen` where the stack is laid out; its header, Cancel, its title and Save;
// and the guard that asks before what was written is lost, as `apps/web/src/lib/unsaved.ts`
// asks on the web. The guard holds the screen, so every way out asks: Cancel, a swipe down, the
// back of Android, a link. iOS asks in an action sheet and Android in a dialog, each the
// platform's way.

/** Asks whether to lose what was written. True when the person said to. */
export function askToDiscard(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: m.native_discard_title(),
          message: m.native_discard_message(),
          options: [m.native_discard(), m.native_keep_editing()],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => resolve(index === 0),
      );
      return;
    }
    Alert.alert(
      m.native_discard_title(),
      m.native_discard_message(),
      [
        { text: m.native_keep_editing(), style: "cancel", onPress: () => resolve(false) },
        { text: m.native_discard(), style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Holds the screen while `dirty`, and asks before it is left. `close` leaves without asking,
 * once what was written is saved.
 */
export function useSheetGuard(dirty: boolean) {
  const navigation = useNavigation();
  // Where the person goes once they said to lose what was written, or once it was saved: the
  // guard is let go first, and the way out taken after, so that it is not asked about again.
  const [leaving, setLeaving] = useState<NavigationAction | "back" | null>(null);

  usePreventRemove(dirty && leaving === null, ({ data }) => {
    void askToDiscard().then((discard) => {
      if (discard) setLeaving(data.action);
    });
  });

  useEffect(() => {
    if (leaving === null) return;
    if (leaving === "back") navigation.goBack();
    else navigation.dispatch(leaving);
  }, [leaving, navigation]);

  return {
    /** Leaves the sheet without asking. */
    close: () => setLeaving("back"),
    /** Leaves the sheet, asking first while something is held. */
    cancel: () => navigation.goBack(),
  };
}

type SheetHeaderProps = {
  title: string;
  /** Leaves the sheet. With the guard, `useSheetGuard(...).cancel`. */
  onCancel: () => void;
  /** Saves what the sheet holds. Without it, the header has no Save. */
  onSave?: () => void;
  saveLabel?: string;
  /** Whether what the sheet holds can be saved yet. */
  canSave?: boolean;
  saving?: boolean;
};

/** The header of a form sheet: Cancel, its title, Save. */
export function SheetHeader({
  title,
  onCancel,
  onSave,
  saveLabel,
  canSave = true,
  saving = false,
}: SheetHeaderProps) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        // Room over it for the grabber that iOS draws at the top of the sheet.
        paddingTop: space.s,
        paddingBottom: space.xs,
        paddingHorizontal: space.xs,
      }}
    >
      <View style={{ flex: 1, alignItems: "flex-start" }}>
        <Button variant="ghost" onPress={onCancel} disabled={saving}>
          {m.action_cancel()}
        </Button>
      </View>
      <Text
        weight="medium"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flexShrink: 1, textAlign: "center" }}
      >
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        {onSave ? (
          <Button onPress={onSave} disabled={!canSave} loading={saving}>
            {saveLabel ?? m.native_save()}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The root of a form sheet that holds a scroll view under something else: a header, a title, a
 * row of tabs. react-native-screens gives a sheet's scroll view the sheet's whole frame when it
 * finds one among the sheet's own children, or down their first children, and Fabric flattens the
 * views that only lay out, so that a scroll view under a header became such a child and was moved
 * to the top of the sheet, over the header, or out of sight. This root is never flattened, and its
 * first child, of no size, ends that search: the scroll view keeps the layout the sheet gives it.
 * A sheet whose scroll view is its only content needs none. Decision 069.
 */
export function SheetRoot({
  style,
  className,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View collapsable={false} style={style} className={className}>
      <View collapsable={false} pointerEvents="none" style={{ position: "absolute" }} />
      {children}
    </View>
  );
}
