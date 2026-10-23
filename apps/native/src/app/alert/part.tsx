import { STEPS } from "@repo/client/alerts/editing";
import { useLocalSearchParams } from "expo-router";

import type { PartKey } from "@/components/alerts/bridge";
import { PartSheet } from "@/components/alerts/part-sheet";
import { SheetRoot } from "@/components/ui/sheet";
import { useTheme } from "@/lib/theme";

// The parts of an alert's sentence a sheet changes: the steps of a new alert, and the swell alone.
const PARTS: readonly string[] = [
  ...STEPS,
  "primarySwellHeightMeters",
  "primarySwellDirectionDegrees",
];

/**
 * What changes a part of the alert that is written, `?part=<part>&index=<n>`, in a sheet as tall
 * as what it holds over the editor's (decision 031, "The editor"). Its row of values scrolls
 * sideways under the part's name, which `SheetRoot` keeps where it stands.
 */
export default function Screen() {
  const { colors } = useTheme();
  const { part, index } = useLocalSearchParams<{ part?: string; index?: string }>();
  const key = part && PARTS.includes(part) ? (part as PartKey) : undefined;
  const at = Math.max(0, Math.min(3, Number(index) || 0));
  return (
    <SheetRoot style={{ backgroundColor: colors["cte-canvas"] }}>
      {key ? <PartSheet partKey={key} index={at} /> : null}
    </SheetRoot>
  );
}
