import { Skeleton as HeroSkeleton } from "heroui-native";
import type { ReactNode } from "react";
import { type DimensionValue, View } from "react-native";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { TextStep } from "./text";

// The place of what is coming, on the theme's muted ground, which pulses as the web's does:
// HeroUI Native's skeleton, which holds still for a reader who asked for no motion. A screen
// reader hears that it is loading, once, and none of the shapes.

type SkeletonProps = {
  width?: DimensionValue;
  height: number;
  /** Round, as an avatar or a round button; else the theme's smallest radius. */
  round?: boolean;
  /** A larger step of the theme's radii, for the place of what has it: a tile at `s`. */
  corner?: "xs" | "s" | "m";
};

export function Skeleton({ width = "100%", height, round = false, corner = "xs" }: SkeletonProps) {
  const { colors, radius } = useTheme();
  return (
    <HeroSkeleton
      variant="pulse"
      style={{
        width,
        height,
        borderRadius: round ? height / 2 : Math.min(radius[corner], height / 2),
        backgroundColor: colors["neutral-3"],
      }}
    />
  );
}

/** Lines of text to come, as tall as a step of the theme's type, the last one shorter. */
export function SkeletonText({ lines = 3, size = "m" }: { lines?: number; size?: TextStep }) {
  const { type } = useTheme();
  const { size: height, line } = type[size];
  return (
    <View style={{ gap: line - height }}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height={height}
          width={index === lines - 1 && lines > 1 ? "60%" : "100%"}
        />
      ))}
    </View>
  );
}

/** What stands in for a screen's content while it loads: one "Loading" to a screen reader. */
export function Loading({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View
      accessible
      accessibilityLabel={label ?? m.native_loading()}
      accessibilityState={{ busy: true }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </View>
  );
}
