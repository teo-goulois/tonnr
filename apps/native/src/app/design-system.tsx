import { Redirect } from "expo-router";

import { DesignSystemScreen } from "@/components/design-system/design-system-screen";

/**
 * The kit with its variants and states, in development only, at `app.tonnr://design-system`:
 * a build for testers or a store goes to the map instead.
 */
export default function DesignSystemRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <DesignSystemScreen />;
}
