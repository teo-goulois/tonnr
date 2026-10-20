import * as Notifications from "expo-notifications";
import { useEffect } from "react";

import { useAccount } from "@/lib/account";
import { isNewToken, openNotification, preparePush, renewPush } from "@/lib/push";

// A push that comes while the app is open is shown as a banner too, as it would be closed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * What the app does of push wherever it is: makes its channels and categories in its language,
 * says its token again to the API at each start and when the system gives another, and opens
 * what a pressed notification speaks of, the one that opened the app too. Decision 072.
 */
export function PushListener() {
  const { userId } = useAccount();

  useEffect(() => {
    void preparePush().catch(() => {});
  }, []);

  useEffect(() => {
    if (!userId) return;
    void renewPush(userId).catch(() => {});
    const token = Notifications.addPushTokenListener((given) => {
      if (isNewToken(given)) void renewPush(userId, String(given.data)).catch(() => {});
    });
    return () => token.remove();
  }, [userId]);

  useEffect(() => {
    const opened = Notifications.getLastNotificationResponse();
    if (opened) openNotification(opened);
    const pressed = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => pressed.remove();
  }, []);

  return null;
}
