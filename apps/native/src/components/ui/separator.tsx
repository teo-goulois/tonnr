import { Separator as HeroSeparator } from "heroui-native";

import { useTheme } from "@/lib/theme";

// HeroUI Native's separator, which the theme's grey already colors: a line as fine as the
// theme's edges, which a list starts after its icons with `inset`.

type SeparatorProps = {
  vertical?: boolean;
  /** Where the line starts, from the leading edge: a row's title, past its icon. */
  inset?: number;
};

export function Separator({ vertical = false, inset = 0 }: SeparatorProps) {
  const { colors, border } = useTheme();
  return (
    <HeroSeparator
      orientation={vertical ? "vertical" : "horizontal"}
      thickness={border.s}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ backgroundColor: colors["neutral-4"], marginStart: inset }}
    />
  );
}
