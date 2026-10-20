import { Redirect, useLocalSearchParams } from "expo-router";

import { UnitStep } from "@/components/account/settings-steps";
import { isMeasure } from "@/components/account/settings-words";

/** The unit one measurement is written in, `?measure=windSpeed` (decision 033). */
export default function UnitScreen() {
  const { measure } = useLocalSearchParams<{ measure?: string }>();
  if (!isMeasure(measure)) return <Redirect href="/account" />;
  return <UnitStep measure={measure} />;
}
