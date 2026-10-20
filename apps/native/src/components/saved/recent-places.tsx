import { Pressable, ScrollView, View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import type { Recent } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { type PlaceActions } from "./place-actions";
import { kindWord, PlaceTile } from "./place-row";
import { SectionHeader } from "./place-section";
import { HeightPill, WindPill, seaWords } from "./sea-figures";
import { keyOf, seaFiguresOf } from "./sea-now";
import { type SeaReader, useSeaNows } from "./use-sea-now";

// What the reader looked at last, the last first, as a row of cards that scrolls across the
// screen: each its place, its name and the sea there now. A press opens the place again.
// Decision 042. Nothing is drawn when nothing was looked at.

const CARD_WIDTH = 148;

export function RecentPlaces({
  recents,
  reader,
  actions,
  onClear,
  bleed,
}: {
  recents: readonly Recent[];
  reader: SeaReader;
  actions: PlaceActions;
  onClear: () => void;
  /** The room of what holds the row, which it crosses to the screen's edges. */
  bleed: number;
}) {
  const { colors, space } = useTheme();
  const asked = useSeaNows(
    reader,
    recents.map((recent) => ({ kind: recent.kind, id: recent.id })),
  );
  if (recents.length === 0) return null;

  return (
    <View style={{ gap: space.xs }}>
      <SectionHeader
        title={m.recents_title()}
        action={{ label: m.recents_clear(), onPress: onClear }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + space.xs}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={{ gap: space.xs, paddingHorizontal: bleed }}
      >
        {recents.map((recent, index) => {
          const ref = { kind: recent.kind, id: recent.id };
          const told = asked[index]?.data;
          const figures = told ? seaFiguresOf(told.sea, told.at) : null;
          const kind = kindWord(recent.kind, told?.sea);
          return (
            <Pressable
              key={keyOf(ref)}
              accessibilityRole="button"
              accessibilityLabel={
                figures
                  ? `${recent.name}, ${kind}, ${seaWords(figures)}`
                  : `${recent.name}, ${kind}`
              }
              onPress={() => actions.run("open", { ref, name: recent.name }, {})}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Surface
                style={{
                  width: CARD_WIDTH,
                  minHeight: 120,
                  padding: space.s,
                  gap: space.xs,
                  justifyContent: "space-between",
                }}
              >
                <View style={{ gap: space.xs }}>
                  <PlaceTile kind={recent.kind} sea={told?.sea} />
                  <Text weight="medium" numberOfLines={2}>
                    {recent.name}
                  </Text>
                </View>
                <View style={{ flexDirection: "row" }}>
                  {asked[index]?.isPending ? (
                    <Skeleton width={56} height={28} round />
                  ) : figures?.heightMeters != null ? (
                    <HeightPill meters={figures.heightMeters} />
                  ) : figures?.windKnots != null ? (
                    <WindPill knots={figures.windKnots} />
                  ) : (
                    <Text size="s" tone="muted" style={{ color: colors["neutral-6"] }}>
                      –
                    </Text>
                  )}
                </View>
              </Surface>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
