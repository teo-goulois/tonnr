import { MapIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { type Found, keyOf } from "./found";
import type { PlaceSearching } from "./use-place-search";

// What a search found, as the platform groups a list: the account's own spots first, then the
// breaks of the catalogue, the buoys and the places, each a section of rows with the mark of its
// kind, as the web's `PlaceSearch` lists them. While the first answer comes, the rows it will
// fill pulse; what the search came to is said to a screen reader.

export const MARK = 28;
/** The saved tab's mark, the web's `size-6` with a glyph of 14 points. */
export const SMALL_MARK = 24;

/**
 * What says the kind of a thing found, as the lists of the saved tab draw it. `small` is the saved
 * tab's own, as the web's rows draw it: 24 points, a station an empty disc of the theme's third
 * grey, and a list of someone else's the map's sign on that grey.
 */
export function FoundMark({
  kind,
  small = false,
}: {
  kind: Found["kind"] | "list";
  small?: boolean;
}) {
  const { colors } = useTheme();
  const size = small ? SMALL_MARK : MARK;
  const ground =
    kind === "spot"
      ? colors["color-1"]
      : kind === "break"
        ? colors["neutral-10"]
        : small
          ? colors["neutral-3"]
          : colors["neutral-4"];
  const ink = kind === "spot" || kind === "break" ? colors["neutral-1"] : colors["neutral-10"];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ground,
      }}
    >
      {kind === "station" ? (
        small ? null : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ink }} />
        )
      ) : (
        <Glyph
          icon={kind === "break" ? WaveIcon : kind === "list" ? MapIcon : PinIcon}
          size={small ? 14 : 16}
          color={ink}
        />
      )}
    </View>
  );
}

type FoundRowProps = {
  found: Pick<Found, "kind" | "name" | "where">;
  onPress: () => void;
};

/** A thing found: its mark, its name, and where it lies. */
export function FoundRow({ found, onPress }: FoundRowProps) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={found.where ? `${found.name}, ${found.where}` : found.name}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
      })}
    >
      <FoundMark kind={found.kind} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{found.name}</Text>
        {found.where ? (
          <Text size="s" tone="muted" numberOfLines={1}>
            {found.where}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Rows to come, in a section of the list. */
function PendingRows() {
  const { space } = useTheme();
  return (
    <Loading>
      <Surface style={{ paddingVertical: space.xs }}>
        {[0.7, 0.5, 0.6].map((width) => (
          <View
            key={width}
            style={{
              minHeight: TARGET,
              flexDirection: "row",
              alignItems: "center",
              gap: space.s,
              paddingHorizontal: space.m,
            }}
          >
            <Skeleton width={MARK} height={MARK} round />
            <Skeleton width={`${width * 100}%`} height={15} />
          </View>
        ))}
      </Surface>
    </Loading>
  );
}

type FoundListProps = {
  search: PlaceSearching;
  onPick: (found: Found) => void;
};

export function FoundList({ search, onPick }: FoundListProps) {
  const { space } = useTheme();
  const groups = [
    { kind: "spot" as const, label: m.spots_title(), items: search.spots },
    { kind: "break" as const, label: m.map_breaks(), items: search.breaks },
    { kind: "station" as const, label: m.map_buoys(), items: search.stations },
    { kind: "place" as const, label: m.spot_search_places(), items: search.places },
  ].filter((group) => group.items.length > 0);
  const found = groups.reduce((count, group) => count + group.items.length, 0);
  const isEmpty = !search.isPending && found === 0;

  // What the search came to, said to who cannot see the list once its answer is in.
  const said = search.isPending
    ? undefined
    : isEmpty
      ? search.isError
        ? m.search_failed()
        : m.search_empty()
      : m.native_search_count({ count: found });
  useEffect(() => {
    if (said) AccessibilityInfo.announceForAccessibility(said);
  }, [said]);

  if (search.isPending && found === 0) return <PendingRows />;
  if (isEmpty) {
    return (
      <Text tone="muted" style={{ paddingHorizontal: space.m }}>
        {said}
      </Text>
    );
  }
  return (
    <View style={{ gap: space.l }}>
      {groups.map((group) => (
        <Section key={group.kind} title={group.label}>
          {group.items.map((one) => (
            <FoundRow key={keyOf(one)} found={one} onPress={() => onPick(one)} />
          ))}
        </Section>
      ))}
      {search.places.length > 0 && search.credit ? (
        <Text size="xs" tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.spot_search_credit({ credit: search.credit })}
        </Text>
      ) : null}
    </View>
  );
}
