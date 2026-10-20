import { ActionSheetIOS, Alert, Platform } from "react-native";

import { m } from "@/paraglide/messages";

// The menu a long press on a row of the friends opens, in the platform's own words: an action
// sheet on iOS, a dialog on Android. What cannot be undone is asked again through the saved
// screens' `confirmDestructive`.

export type Choice = {
  /** What a screen reader's action is named by. */
  name: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Asks to choose among a few things to do, with a way out: the menu a long press on a row
 * opens. `title` names what it is about.
 */
export function chooseAmong(title: string, choices: readonly Choice[]) {
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
