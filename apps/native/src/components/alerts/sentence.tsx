import { Fragment } from "react";
import { Pressable, View } from "react-native";

import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text, type TextStep } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// An alert said in one sentence, as the web's editor says it, whose parts each open what changes
// them: the words flow and wrap as a paragraph does, and each part is a target of its own, a
// finger's height, underlined as the web underlines it, darker once it asks something and
// lifted on a light ground while it is the part a new alert asks next. A screen reader reaches
// each part as a button that says what it is of and what it says; the words between are the
// parts' own labels' to say. Decision 031, "The editor".

export type SentencePart = {
  key: string;
  /** What the part says, in the sentence. */
  words: string;
  /** What it is of, for a screen reader: "The height of the waves". */
  label: string;
  /** What it says, for a screen reader, when the sentence writes it otherwise: an arrow. */
  spoken?: string;
  /** Whether it asks something: written darker. */
  isSet: boolean;
  /** The part a new alert asks next. */
  current?: boolean;
  /** What follows its last word and is no part of it: a comma, a full stop. */
  after?: string;
  onPress: () => void;
};

export type SentencePiece =
  | { kind: "words"; text: string }
  | { kind: "or" }
  | { kind: "part"; part: SentencePart };

const SPACE = 6;

function Part({ part, size }: { part: SentencePart; size: TextStep }) {
  const { colors, space } = useTheme();
  const slop = Math.max(0, Math.ceil((TARGET - 31) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={m.alert_slot_name({
        label: part.label,
        words: part.spoken ?? part.words,
      })}
      accessibilityHint={m.native_alert_part_hint()}
      hitSlop={{ top: slop, bottom: slop, left: 2, right: 2 }}
      onPress={() => {
        feel("select");
        part.onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        maxWidth: "100%",
        borderRadius: 8,
        paddingHorizontal: part.current ? space.xxs : 0,
        marginHorizontal: part.current ? -space.xxs : 0,
        backgroundColor: part.current
          ? colors["neutral-3"]
          : pressed
            ? colors["neutral-3-transparent"]
            : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text size={size} style={{ flexShrink: 1 }}>
        <Text
          size={size}
          weight={part.isSet ? "medium" : "regular"}
          style={{
            color: part.isSet || part.current ? colors["neutral-10"] : colors["neutral-7"],
            textDecorationLine: "underline",
            textDecorationStyle: part.current ? "solid" : "dotted",
            textDecorationColor: part.isSet ? colors["neutral-8"] : colors["neutral-6"],
          }}
        >
          {part.words}
        </Text>
        {part.after ?? ""}
      </Text>
    </Pressable>
  );
}

/** The sentence, its words flowing around its parts. */
export function Sentence({ pieces, size = "l" }: { pieces: SentencePiece[]; size?: TextStep }) {
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: SPACE }}
    >
      {pieces.map((piece, index) => {
        if (piece.kind === "part")
          return <Part key={piece.part.key} part={piece.part} size={size} />;
        const words = piece.kind === "or" ? [m.alert_or_word()] : piece.text.split(" ");
        return (
          // The words keep their place in the sentence: nothing else tells them apart.
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {words.map((word, at) => (
              <Text
                // oxlint-disable-next-line react/no-array-index-key
                key={at}
                size={size}
                tone={piece.kind === "or" ? "muted" : "default"}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {word}
              </Text>
            ))}
          </Fragment>
        );
      })}
    </View>
  );
}
