import { Stack } from "expo-router";

/** The tab of the account: who is signed in, and the settings, one step into it each (decision 040). A stack of its own, so that a step into it goes back with the platform's own gesture. */
export default function Layout() {
  return <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: false }} />;
}
