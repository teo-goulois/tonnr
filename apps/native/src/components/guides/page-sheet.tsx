import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { askToDiscard, SheetHeader } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A sheet a screen opens over whatever is open, without a route of its own: the platform's page
// sheet on iOS, which a swipe down closes, and a screen that slides up on Android, which its back
// closes. A line of a guide is written in one, and so is the reason of a contest, a friend read
// and an invitation answered: each over the sheet of a place or a tab, which stays where it was.
// While something written would be lost, a swipe does not close it, and every other way out asks
// first, as the form sheets of `sheet.tsx` do.

// How long a sheet takes to leave, after which whatever waited on it goes on: iOS says when it
// is gone, and this is there in case it does not.
const LEAVING_MS = Platform.OS === "ios" ? 600 : 300;

/**
 * What a sheet shows, kept while it leaves, and what follows once it is gone: a sheet that leads
 * elsewhere closes first, so that two screens never move at once.
 */
export function usePresented<Shown>() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [visible, setVisible] = useState(false);
  const after = useRef<(() => void) | null>(null);
  // The same functions at every drawing, so that what waits on them runs when it should.
  const present = useCallback((what: Shown) => {
    after.current = null;
    setShown(what);
    setVisible(true);
  }, []);
  /** Closes the sheet, then does `then` once it is gone. */
  const dismiss = useCallback((then?: () => void) => {
    after.current = then ?? null;
    setVisible(false);
  }, []);
  /** What the sheet calls once it is gone. */
  const dismissed = useCallback(() => {
    setShown(null);
    const then = after.current;
    after.current = null;
    then?.();
  }, []);
  return { shown, visible, present, dismiss, dismissed };
}

type PageSheetProps = {
  visible: boolean;
  title: string;
  /** Asks to close the sheet: once nothing is lost, or once it is done. */
  onClose: () => void;
  /** Once the sheet is gone, after it was closed. */
  onDismissed?: () => void;
  /** Something written and not sent: leaving asks first. */
  dirty?: boolean;
  /** Sends what the sheet holds: the header then has Cancel, the title and this button. */
  onSave?: () => void;
  saveLabel?: string;
  canSave?: boolean;
  saving?: boolean;
  children: ReactNode;
};

export function PageSheet({
  visible,
  title,
  onClose,
  onDismissed,
  dirty = false,
  onSave,
  saveLabel,
  canSave,
  saving,
  children,
}: PageSheetProps) {
  const { colors, space } = useTheme();
  // Android draws the sheet over the whole screen, under its bars: it keeps clear of them. An
  // iPhone's page sheet starts under the status bar, and its scroll keeps clear of the bottom.
  const insets = useSafeAreaInsets();
  const bars = Platform.OS === "android" ? insets : { top: 0, bottom: 0 };
  // A reader who asked for less motion sees it come in place, without its slide.
  const still = useReducedMotion();

  // Once it was shown and is hidden again, it says it is gone, once.
  const gone = useRef(true);
  const finish = () => {
    if (gone.current) return;
    gone.current = true;
    onDismissed?.();
  };
  useEffect(() => {
    if (visible) {
      gone.current = false;
      return;
    }
    if (gone.current) return;
    const timer = setTimeout(finish, LEAVING_MS);
    return () => clearTimeout(timer);
  });

  const leave = () => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    void askToDiscard().then((discard) => {
      if (discard) onClose();
    });
  };

  return (
    <Modal
      visible={visible}
      animationType={still ? "fade" : "slide"}
      presentationStyle="pageSheet"
      allowSwipeDismissal={!dirty && !saving}
      onRequestClose={leave}
      onDismiss={finish}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* A sheet of its own is a root of its own, for the gestures and on Android's window. */}
      <GestureHandlerRootView
        style={{ flex: 1, paddingTop: bars.top, backgroundColor: colors["cte-canvas"] }}
      >
        {onSave ? (
          <SheetHeader
            title={title}
            onCancel={leave}
            onSave={onSave}
            saveLabel={saveLabel}
            canSave={canSave}
            saving={saving}
          />
        ) : (
          <ViewerHeader title={title} onClose={leave} />
        )}
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          bottomOffset={space.l}
          contentContainerStyle={{
            gap: space.l,
            paddingHorizontal: space.m,
            paddingTop: space.s,
            paddingBottom: space.xxl + bars.bottom,
          }}
        >
          {children}
        </KeyboardAwareScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The header of a sheet that is read and sends nothing: its title, and what closes it. */
function ViewerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingTop: space.s,
        paddingBottom: space.xs,
        paddingStart: space.m,
        paddingEnd: space.xs,
      }}
    >
      <Text
        weight="medium"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flex: 1, flexShrink: 1 }}
      >
        {title}
      </Text>
      <Button variant="ghost" onPress={onClose}>
        {m.action_close()}
      </Button>
    </View>
  );
}
