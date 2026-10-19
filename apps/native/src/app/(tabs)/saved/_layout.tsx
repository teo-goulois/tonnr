import { Stack } from "expo-router";

/** The tab of what is saved: the lists, the spots, what was looked at last (decisions 017 and 042). A stack of its own, so that a step into it goes back with the platform's own gesture. */
export default function Layout() {
  return <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: false }} />;
}
