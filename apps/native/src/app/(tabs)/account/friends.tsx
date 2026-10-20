import { Stack } from "expo-router";

import { FriendsScreen } from "@/components/friends/friends-screen";
import { m } from "@/paraglide/messages";

/** The account's link, its code, and its friends (decision 041). */
export default function Screen() {
  return (
    <>
      <Stack.Screen options={{ title: m.friends_title() }} />
      <FriendsScreen />
    </>
  );
}
