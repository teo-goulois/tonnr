import type { ReactNode } from "react";
import { View } from "react-native";

import type { GlyphIcon } from "@/components/shared/glyph";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

import type { RowContext } from "./actions";
import type { PlaceActions, PlaceItem } from "./place-actions";
import { PlaceRow, PlaceRowSkeleton } from "./place-row";
import type { SavedRow } from "./use-saved-places";

// The parts of the saved tab, as the web's `SavedPanel` lays them: a section's heading in the
// body's medium, with how many it holds in muted figures beside it and what is done with it at
// its end, flush with the screen's room; then its rows, which stand on the screen's ground with
// no card and no line between them, their marks in line with the heading.

type SectionHeaderProps = {
  title: string;
  /** How many the section holds, beside its title. */
  count?: number | undefined;
  /** One thing to do at its end, as adding a spot or clearing what was looked at. */
  action?: { label: string; onPress: () => void; icon?: GlyphIcon; variant?: ButtonVariant };
  /** What stands at its end in place of an action: a list's small buttons. */
  accessory?: ReactNode;
};

export function SectionHeader({ title, count, action, accessory }: SectionHeaderProps) {
  const { space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.s,
      }}
    >
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
        style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs, flexShrink: 1 }}
      >
        <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {count !== undefined ? (
          <Text size="s" tone="muted" numeric>
            {count}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button variant={action.variant ?? "ghost"} icon={action.icon} onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
      {accessory}
    </View>
  );
}

type PlaceRowsProps = {
  rows: readonly SavedRow[];
  now: number;
  /** Where each row stands, which says what it offers. */
  contextOf: (item: PlaceItem) => RowContext;
  actions: PlaceActions;
  /** Each row has the X that takes it out of the account's list. */
  removable?: boolean;
};

/** The rows of a section, on the screen's ground: the web's `-mx-xs grid gap-xxs`. */
export function PlaceRows({ rows, now, contextOf, actions, removable = false }: PlaceRowsProps) {
  const { space } = useTheme();
  return (
    <View style={{ marginHorizontal: -space.xs, gap: space.xxs }}>
      {rows.map((row) =>
        "waiting" in row ? (
          <Loading key={row.key}>
            <PlaceRowSkeleton />
          </Loading>
        ) : (
          <PlaceRow
            key={row.key}
            item={row.item}
            station={row.station}
            now={now}
            context={contextOf(row.item)}
            actions={actions}
            removable={removable}
          />
        ),
      )}
    </View>
  );
}

/**
 * The place of rows while they are read, never a spinner: with `heading`, a section's heading
 * over them too, as the web's tab waits for the account's lists.
 */
export function RowsWaiting({ count = 3, heading = false }: { count?: number; heading?: boolean }) {
  const { space, type } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.xs }}>
        {heading ? <Skeleton width={96} height={type.m.line} /> : null}
        <View style={{ marginHorizontal: -space.xs, gap: space.xxs }}>
          {Array.from({ length: count }, (_, index) => (
            <PlaceRowSkeleton key={index} />
          ))}
        </View>
      </View>
    </Loading>
  );
}
