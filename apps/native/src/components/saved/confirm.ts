import { ActionSheetIOS, Alert, Platform } from "react-native";

import { feel } from "@/components/ui/haptics";
import { m } from "@/paraglide/messages";

// The second step of what cannot be undone, each platform's own way: iOS asks in an action
// sheet whose button says what it does, in red, and Android in a dialog. As the kit's
// `askToDiscard` asks before what was written is lost.

type Asked = {
  title: string;
  message?: string;
  /** What the button that goes on says: what it does, "Delete the list". */
  confirm: string;
};

/** Asks before something that cannot be undone. True when the person said to go on. */
export function confirmDestructive({ title, message, confirm }: Asked): Promise<boolean> {
  feel("warn");
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirm, m.action_cancel()],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => resolve(index === 0),
      );
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: m.action_cancel(), style: "cancel", onPress: () => resolve(false) },
        { text: confirm, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Asks which of a few to take, in iOS's action sheet: for a screen reader, which cannot open a
 * menu by holding. Undefined when the person cancelled. Android has its own sheet.
 */
export function chooseOnIos(
  title: string,
  options: readonly string[],
): Promise<number | undefined> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, m.action_cancel()], cancelButtonIndex: options.length },
      (index) => resolve(index < options.length ? index : undefined),
    );
  });
}
