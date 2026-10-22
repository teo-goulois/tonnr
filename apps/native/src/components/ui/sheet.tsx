import { ChevronLeftIcon, XIcon } from "@repo/ui/icon";
import { type NavigationAction, router, useNavigation, usePreventRemove } from "expo-router";
import { Children, type ReactNode, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { Button, IconButton } from "./button";
import { Text } from "./text";

// What a screen needs to be a form sheet: its options are `formSheet` (sheet-options.ts), given
// to its `Stack.Screen` where the stack is laid out; its header, Cancel, its title and Save;
// and the guard that asks before what was written is lost, as `apps/web/src/lib/unsaved.ts`
// asks on the web. The guard holds the screen, so every way out asks: Cancel, a swipe down, the
// back of Android, a link. iOS asks in an action sheet and Android in a dialog, each the
// platform's way.

/** The words of the question, which a form may say in its own: the alert editor's are the web's. */
export type DiscardWords = { title: string; message: string; leave: string; stay: string };

function discardWords(): DiscardWords {
  return {
    title: m.native_discard_title(),
    message: m.native_discard_message(),
    leave: m.native_discard(),
    stay: m.native_keep_editing(),
  };
}

/** Asks whether to lose what was written. True when the person said to. */
export function askToDiscard(words: DiscardWords = discardWords()): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: words.title,
          message: words.message,
          options: [words.leave, words.stay],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => resolve(index === 0),
      );
      return;
    }
    Alert.alert(
      words.title,
      words.message,
      [
        { text: words.stay, style: "cancel", onPress: () => resolve(false) },
        { text: words.leave, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Holds the screen while `dirty`, and asks before it is left. `close` leaves without asking,
 * once what was written is saved. `onDiscard` is called once the person said to lose it.
 */
export function useSheetGuard(dirty: boolean, onDiscard?: () => void, words?: DiscardWords) {
  const navigation = useNavigation();
  // Where the person goes once they said to lose what was written, or once it was saved: the
  // guard is let go first, and the way out taken after, so that it is not asked about again.
  const [leaving, setLeaving] = useState<NavigationAction | "back" | null>(null);

  usePreventRemove(dirty && leaving === null, ({ data }) => {
    void askToDiscard(words).then((discard) => {
      if (!discard) return;
      onDiscard?.();
      setLeaving(data.action);
    });
  });

  // Back, or to the map for a sheet with nothing under it, which the root's anchor otherwise
  // puts there.
  const back = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  };

  useEffect(() => {
    if (leaving === null) return;
    if (leaving !== "back") navigation.dispatch(leaving);
    else if (navigation.canGoBack()) navigation.goBack();
    else router.replace("/");
  }, [leaving, navigation]);

  return {
    /** Leaves the sheet without asking. */
    close: () => setLeaving("back"),
    /** Leaves the sheet, asking first while something is held. */
    cancel: back,
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

type PanelHeaderProps = {
  title: string;
  /** A line under the title, in the theme's ink: the place a form is about. */
  description?: string | undefined;
  /** The line in the muted ink, as a dialog's description is: why an account is asked for. */
  mutedDescription?: boolean;
  /** Goes back a step inside the sheet: a chevron before the title. */
  onBack?: (() => void) | undefined;
  /** Leaves the sheet, by the cross at its end. With the guard, `useSheetGuard(...).cancel`. */
  onClose: () => void;
  /** What stands before the cross: a few round buttons of its own. */
  actions?: ReactNode;
};

/**
 * The head of a sheet as the web's drawer draws it on a phone (`ViewerDrawer`): a chevron that
 * goes back when there is a step to go back to, the title at the theme's large step at the start,
 * a line under it, then what the sheet offers and the cross that closes it. What a form sends is
 * at its foot, in `SheetFooter`, never in its head.
 */
export function PanelHeader({
  title,
  description,
  mutedDescription = false,
  onBack,
  onClose,
  actions,
}: PanelHeaderProps) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: space.xs,
        // Room over it for the grabber that the platform draws at the top of the sheet.
        paddingTop: space.m,
        paddingHorizontal: space.m,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs, flexShrink: 1 }}
      >
        {onBack ? (
          <IconButton
            icon={ChevronLeftIcon}
            label={m.action_back()}
            variant="ghost"
            onPress={onBack}
            style={{ marginLeft: -space.xs, marginTop: -space.xs }}
          />
        ) : null}
        <View style={{ gap: space.xxs, flexShrink: 1 }}>
          <Text size="l" weight="medium" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {description ? (
            <Text size="s" tone={mutedDescription ? "muted" : "default"}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xxs,
          marginRight: -space.xs,
          marginTop: -space.xs,
        }}
      >
        {actions}
        <IconButton icon={XIcon} label={m.action_close()} variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

/**
 * The foot of a sheet, as the web's drawer lays it: what the form sends, its buttons sharing the
 * sheet's width (give each `fill`), with the room the web gives it. `pinned` stands it under what
 * scrolls, above the bottom of the phone, as the alert editor's; otherwise it ends the form.
 */
export function SheetFooter({
  children,
  pinned = false,
}: {
  children: ReactNode;
  pinned?: boolean;
}) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.xs,
        paddingHorizontal: pinned ? space.m : 0,
        paddingTop: pinned ? space.xs : 0,
        paddingBottom: pinned ? Math.max(space.m, insets.bottom) : 0,
      }}
    >
      {Children.toArray(children).map((child, index) => (
        <View key={index} style={{ flex: 1, minWidth: 0 }}>
          {child}
        </View>
      ))}
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
