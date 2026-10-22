import { InfoFillIcon } from "@repo/ui/icon";
import { Linking, Pressable, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { edge } from "@/components/ui/edge";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { CreditPart } from "./basemap";

// Whose data the map draws, as the web's map writes it on a phone: a box at the top of the map
// with each name that leads somewhere as a link, and the button of MapLibre's own credits at its
// corner, which folds it. The licences ask that a reader who looks for it finds it: once folded,
// the legend's last line opens it again (decision 018).

// MapLibre's own box: its corners, the room it leaves its button, and its button.
const CORNER = 12;
const BUTTON = 24;

type MapCreditsProps = {
  parts: readonly CreditPart[];
  onFold: () => void;
};

export function MapCredits({ parts, onFold }: MapCreditsProps) {
  const { colors, border } = useTheme();
  const slop = (TARGET - BUTTON) / 2;
  return (
    <View
      style={{
        minHeight: BUTTON - 4,
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 8,
        paddingRight: BUTTON + 4,
        borderRadius: CORNER,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-1"],
        ...edge(colors["neutral-10-transparent"], { width: border.s }),
      }}
    >
      <Text size="xs" tone="muted">
        {parts.map((part, index) =>
          part.href ? (
            <Text
              // The words are in the order their sources wrote them, and never move.
              key={index}
              size="xs"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(part.href!)}
              style={{ color: colors["neutral-10"] }}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={m.map_credits()}
        accessibilityState={{ expanded: true }}
        hitSlop={slop}
        onPress={onFold}
        style={({ pressed }) => ({
          position: "absolute",
          top: 0,
          right: 0,
          width: BUTTON,
          height: BUTTON,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Glyph icon={InfoFillIcon} size={20} color={colors["neutral-10"]} />
      </Pressable>
    </View>
  );
}
