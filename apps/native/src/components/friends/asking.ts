import { ActionSheetIOS, Alert, Platform } from "react-native";

import { m } from "@/paraglide/messages";

// The questions the friends' screens ask before what cannot be undone, and the menu a long press
// opens, in the platform's own words: an action sheet on iOS, a dialog on Android.

type Choice = { label: string; destructive?: boolean; onPress: () => void };

/**
 * Asks to choose among a few things to do, with a way out: the menu a long press on a row
 * opens. `title` names what it is about.
 */
export function chooseAmong(title: string, choices: Choice[]) {
  if (Platform.OS === "ios") {
    const destructive = choices.flatMap((choice, index) => (choice.destructive ? [index] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...choices.map((choice) => choice.label), m.action_cancel()],
        destructiveButtonIndex: destructive,
        cancelButtonIndex: choices.length,
      },
      (index) => choices[index]?.onPress(),
    );
    return;
  }
  Alert.alert(
    title,
    undefined,
    [
      ...choices.map((choice) => ({
        text: choice.label,
        style: choice.destructive ? ("destructive" as const) : ("default" as const),
        onPress: choice.onPress,
      })),
      { text: m.action_cancel(), style: "cancel" as const },
    ],
    { cancelable: true },
  );
}

/** Asks whether to do something that cannot be undone. True when the person said to. */
export function confirmAction({
  title,
  message,
  confirm,
}: {
  title: string;
  message?: string;
  confirm: string;
}): Promise<boolean> {
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
