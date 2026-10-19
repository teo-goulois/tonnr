import { Redirect } from "expo-router";

import { SampleSheet } from "@/components/design-system/sample-sheet";

/** The design system's form sheet, which `_layout.tsx` presents as one. Development only. */
export default function DesignSystemSheetRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <SampleSheet />;
}
