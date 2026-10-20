import { ActionSheetIOS, Alert, Platform } from "react-native";

import { feel } from "@/components/ui/haptics";
import { m } from "@/paraglide/messages";

/**
 * Asks before something that cannot be taken back, the platform's own way: an action sheet on
 * iOS, a dialog on Android, the action in red and Cancel apart. True when the person said to.
 */
export function confirm({
  title,
  message,
  action,
}: {
  title: string;
  message?: string | undefined;
  action: string;
}): Promise<boolean> {
  feel("warn");
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [action, m.action_cancel()],
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
        { text: action, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
