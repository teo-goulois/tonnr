import { Stack } from "expo-router";

/** The tab of the alerts: what they told, and the alerts themselves (decision 031). A stack of its own, so that a step into it goes back with the platform's own gesture. */
export default function Layout() {
  return <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: false }} />;
}
