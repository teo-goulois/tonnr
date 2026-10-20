import { ChevronRightIcon } from "@repo/ui/icon";
import { Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { MARK } from "@/components/search/found-list";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { RowContext } from "./actions";
import type { PlaceActions, PlaceItem } from "./place-actions";
import { PlaceRow, PlaceRowSkeleton } from "./place-row";
import { keyOf } from "./sea-now";
import { type SeaReader, useSeaNows } from "./use-sea-now";

// Places grouped as the platform groups a list: a title over them, which opens the list when it
// is one, then the rows on the theme's surface, a line between two of them that starts at the
// name. Each row shown asks the sea at its place, and the asks of a section leave together; a
// place beyond the rows shown asks nothing, since each call counts a forecast question of the
// reader's hour (decision 074). A place the answer left out, a spot deleted meanwhile or a break
// merged away, leaves no row.

type SectionHeaderProps = {
  title: string;
  /** How many the section holds, beside its title. */
  count?: number;
  /** Opens what the section is, as a list's own screen: the title then has a chevron. */
  onPress?: () => void;
  accessibilityHint?: string;
  /** One thing to do at its end, as adding a spot. */
  action?: { label: string; onPress: () => void };
};

export function SectionHeader({
  title,
  count,
  onPress,
  accessibilityHint,
  action,
}: SectionHeaderProps) {
  const { colors, space } = useTheme();
  const words = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
      <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {count !== undefined ? (
        <Text size="s" tone="muted" numeric>
          {count}
        </Text>
      ) : null}
      {onPress ? <Glyph icon={ChevronRightIcon} size={14} color={colors["neutral-6"]} /> : null}
    </View>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.s,
        minHeight: TARGET,
        paddingHorizontal: space.xxs,
      }}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
          accessibilityHint={accessibilityHint}
          onPress={onPress}
          hitSlop={8}
          style={({ pressed }) => ({ flexShrink: 1, opacity: pressed ? 0.6 : 1 })}
        >
          {words}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="header" style={{ flexShrink: 1 }}>
          {words}
        </View>
      )}
      {action ? (
        <Button variant="ghost" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

type PlaceSectionProps = {
  header?: ReactNode;
  items: readonly PlaceItem[];
  reader: SeaReader;
  /** Where each row stands, which says what it offers. */
  contextOf: (item: PlaceItem) => RowContext;
  actions: PlaceActions;
  /** How many rows it shows at most, with a row that leads to the rest. */
  limit?: number;
  onSeeAll?: () => void;
  /** A line under the rows. */
  footer?: ReactNode;
  /** What it says when it holds nothing. */
  empty?: ReactNode;
};

export function PlaceSection({
  header,
  items,
  reader,
  contextOf,
  actions,
  limit,
  onSeeAll,
  footer,
  empty,
}: PlaceSectionProps) {
  const { space } = useTheme();
  const showing = items.slice(0, limit ?? items.length);
  const asked = useSeaNows(
    reader,
    showing.map((item) => item.ref),
  );
  // A place the answer left out is no more, and leaves no row, unless the screen knows it by its
  // name: a spot of a list read by its link, which the reader sees and is not told the sea of.
  const present = showing.flatMap((item, index) => {
    const query = asked[index];
    return query?.data === null && !item.name ? [] : [{ item, query }];
  });
  const unanswered = ({ query }: (typeof present)[number]) =>
    query?.isError === true && query.data === undefined;
  // A row with no name has nothing to show while its answer failed: the line under the rows
  // asks again for it, and for the sea of the others.
  const failed = present.filter(unanswered);
  const shown = present.filter((one) => !unanswered(one) || one.item.name);
  // What the rows do not show, and the places known to be there, which the last row opens.
  const rest = items.length - showing.length;
  const held = items.length - (showing.length - present.length);

  return (
    <View style={{ gap: space.xs }}>
      {header}
      {present.length === 0 && rest === 0 ? (
        (empty ?? null)
      ) : (
        <Surface insetEdge style={{ overflow: "hidden" }}>
          {shown.map(({ item, query }, index) => (
            <Fragment key={keyOf(item.ref)}>
              {index > 0 ? <Separator inset={space.m + MARK + space.s} /> : null}
              {query?.isPending && !item.name ? (
                <PlaceRowSkeleton />
              ) : (
                <PlaceRow
                  item={item}
                  told={query?.data}
                  pending={query?.isPending ?? true}
                  context={contextOf(item)}
                  actions={actions}
                />
              )}
            </Fragment>
          ))}
          {failed.length > 0 ? (
            <>
              {shown.length > 0 ? <Separator inset={space.m} /> : null}
              <View
                accessibilityRole="alert"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.s,
                  padding: space.m,
                }}
              >
                <Text size="s" tone="muted" style={{ flex: 1 }}>
                  {m.native_places_failed()}
                </Text>
                <Button
                  variant="secondary"
                  loading={failed.some(({ query }) => query?.isFetching)}
                  onPress={() => {
                    for (const { query } of failed) void query?.refetch();
                  }}
                >
                  {m.action_retry()}
                </Button>
              </View>
            </>
          ) : null}
          {rest > 0 && onSeeAll ? (
            <>
              {present.length > 0 ? <Separator inset={space.m} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={onSeeAll}
                style={({ pressed }) => ({
                  minHeight: TARGET,
                  justifyContent: "center",
                  paddingHorizontal: space.m,
                  paddingVertical: space.xs,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text weight="medium">{m.native_see_all({ count: held })}</Text>
              </Pressable>
            </>
          ) : null}
        </Surface>
      )}
      {footer}
    </View>
  );
}
