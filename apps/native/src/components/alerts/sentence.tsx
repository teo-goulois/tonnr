import { CirclePlusIcon, CircleXIcon } from "@repo/ui/icon";
import { type ComponentRef, Fragment, type ReactNode, type Ref, useState } from "react";
import { type AccessibilityActionEvent, Pressable, View } from "react-native";

import { DirectionArrow } from "@/components/forecast/bearing";
import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text, type TextStep } from "@/components/ui/text";
import { compassPoint } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// An alert said in one sentence, as the web's editor says it: one paragraph whose words wrap as
// words do, a part's words with the rest, each part underlined in dots and pressed to open what
// changes it, darker once it asks something, and on the theme's third grey with a solid line
// while it is the part a new alert asks next. A direction is drawn as `Bearing` draws it, an
// arrow turned to the degree, then the point it comes from. After a part's last value stands a
// "+" that adds another, and after each other value an "×" that takes it away, each held to the
// word before it. A screen reader is given the sentence as one element, in words, whose parts,
// "+" and "×" are its actions: a part pressed inside a paragraph has no name of its own there.
// Decision 031, "The editor".

export type SentencePart = {
  key: string;
  /** What the part says, in the sentence. */
  words: string;
  /** What it is of, for a screen reader: "The height of the waves". */
  label: string;
  /** What it says, for a screen reader, when the sentence draws it otherwise: an arrow. */
  spoken?: string;
  /** A direction asked: drawn as "from", then each end of the sector as `Bearing` draws it. */
  sector?: { from: number; to: number };
  /** Whether it asks something: written darker. */
  isSet: boolean;
  /** The part a new alert asks next. */
  current?: boolean;
  onPress: () => void;
};

export type SentencePiece =
  | { kind: "words"; text: string }
  | { kind: "or" }
  | { kind: "part"; part: SentencePart }
  /** Adds another value to a part, or takes an other value away: `label` is the part's name. */
  | { kind: "add" | "remove"; key: string; label: string; onPress: () => void }
  /** What follows a part and is no part of it: a comma, a full stop. */
  | { kind: "mark"; text: string };

// No line breaks between what it joins: an arrow and its point, a word and its "+".
const JOIN = "⁠";
// The room the web's current part takes on each side, `px-xxs`, as the type's thin space.
const PAD = " ";
// The web's round button in the sentence, `size-6`, and its icon, `size-4.5`.
const ICON_BOX = 24;
const ICON = 18;

/** A "+" or an "×" in the line, which stands where the web's does, a little under the middle. */
function IconInLine({ icon, onPress }: { icon: typeof CirclePlusIcon; onPress: () => void }) {
  const { colors, space } = useTheme();
  // A finger's reach around a mark of 24 points.
  const slop = Math.ceil((TARGET - ICON_BOX) / 2);
  return (
    <Pressable
      // The sentence says it among its actions.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      hitSlop={slop}
      onPress={() => {
        feel("select");
        onPress();
      }}
      style={({ pressed }) => ({
        width: ICON_BOX + space.xxs,
        height: ICON_BOX,
        paddingLeft: space.xxs,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
        // A view in a line stands on its baseline: the web's `align-middle -translate-y-0.5`.
        transform: [{ translateY: 4 }],
      })}
    >
      <Glyph icon={icon} size={ICON} color={colors["neutral-7"]} />
    </Pressable>
  );
}

/** An end of a sector in the line: the arrow of the way it goes, then the point it comes from. */
function BearingInLine({ degrees, color, size }: { degrees: number; color: string; size: number }) {
  const { space } = useTheme();
  return (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size + space.xxs, height: size }}
      >
        <DirectionArrow fromDegrees={degrees} size={size} color={color} />
      </View>
      {JOIN}
      {compassPoint(degrees)}
    </>
  );
}

type SentenceProps = {
  pieces: SentencePiece[];
  size?: TextStep;
  /** What a screen reader hears after the sentence: what is wrong with it, once sent. */
  hint?: string | undefined;
  /** Where a screen reader is moved when the sentence is the first wrong field of the form. */
  ref?: Ref<ComponentRef<typeof View>>;
};

/** The sentence, its words flowing around its parts. */
export function Sentence({ pieces, size = "l", hint, ref }: SentenceProps) {
  const { colors, type } = useTheme();
  const [pressed, setPressed] = useState<string | null>(null);
  // An arrow is the size of the type's letters, as the web's `size-[0.85em]`.
  const arrow = Math.round(type[size].size * 0.85);

  const drawn: ReactNode[] = [];
  const spoken: string[] = [];
  const actions: { name: string; label: string; run: () => void }[] = [];

  pieces.forEach((piece, index) => {
    const gap = index > 0 ? " " : "";
    switch (piece.kind) {
      case "words":
        drawn.push(`${gap}${piece.text}`);
        spoken.push(`${gap}${piece.text}`);
        return;
      case "or":
        drawn.push(
          gap,
          // oxlint-disable-next-line react/no-array-index-key
          <Text key={`or-${index}`} size={size} tone="muted">
            {m.alert_or_word()}
          </Text>,
        );
        spoken.push(`${gap}${m.alert_or_word()}`);
        return;
      case "mark":
        drawn.push(piece.text);
        spoken.push(piece.text);
        return;
      case "add":
      case "remove":
        drawn.push(
          JOIN,
          <IconInLine
            key={`${piece.kind}-${piece.key}`}
            icon={piece.kind === "add" ? CirclePlusIcon : CircleXIcon}
            onPress={piece.onPress}
          />,
        );
        actions.push({
          name: `${piece.kind}-${piece.key}`,
          label:
            piece.kind === "add"
              ? m.alert_add_value({ label: piece.label })
              : m.alert_remove_value({ label: piece.label }),
          run: piece.onPress,
        });
        return;
      case "part": {
        const { part } = piece;
        const ink = part.isSet || part.current ? colors["neutral-10"] : colors["neutral-7"];
        const open = () => {
          feel("select");
          part.onPress();
        };
        const words = part.sector ? (
          <>
            {m.alert_from()} <BearingInLine degrees={part.sector.from} color={ink} size={arrow} />–
            <BearingInLine degrees={part.sector.to} color={ink} size={arrow} />
          </>
        ) : (
          part.words
        );
        drawn.push(
          gap,
          <Text
            key={part.key}
            size={size}
            weight={part.isSet ? "medium" : "regular"}
            suppressHighlighting
            onPressIn={() => setPressed(part.key)}
            onPressOut={() => setPressed(null)}
            onPress={open}
            style={{
              color: ink,
              backgroundColor: part.current
                ? colors["neutral-3"]
                : pressed === part.key
                  ? colors["neutral-3-transparent"]
                  : undefined,
            }}
          >
            {part.current ? PAD : null}
            <Text
              size={size}
              weight={part.isSet ? "medium" : "regular"}
              style={{
                color: ink,
                // The web's dotted line, in the part's own ink; solid for the part to answer.
                textDecorationLine: "underline",
                textDecorationStyle: part.current ? "solid" : "dotted",
                textDecorationColor: ink,
              }}
            >
              {words}
            </Text>
            {part.current ? PAD : null}
          </Text>,
        );
        const said = part.spoken ?? part.words;
        spoken.push(`${gap}${said}`);
        actions.push({
          name: `part-${part.key}`,
          // Two parts may read the same: each says what it is of.
          label: m.alert_slot_name({ label: part.label, words: said }),
          run: open,
        });
        return;
      }
    }
  });

  // A double tap opens the part a new alert asks next, or else the first.
  const parts = pieces.flatMap((piece) => (piece.kind === "part" ? [piece.part] : []));
  const first = parts.find((part) => part.current === true) ?? parts[0];
  const activate = first && actions.find((action) => action.name === `part-${first.key}`);

  const onAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    const action = name === "activate" ? activate : actions.find((one) => one.name === name);
    action?.run();
  };

  return (
    <View
      ref={ref}
      accessible
      accessibilityLabel={spoken.join("")}
      accessibilityHint={hint}
      accessibilityActions={[
        ...(activate ? [{ name: "activate" as const }] : []),
        ...actions.map(({ name, label }) => ({ name, label })),
      ]}
      onAccessibilityAction={onAction}
    >
      <Text size={size} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {drawn.map((one, index) =>
          typeof one === "string" ? (
            // The words keep their place in the sentence: nothing else tells them apart.
            // oxlint-disable-next-line react/no-array-index-key
            <Fragment key={`w-${index}`}>{one}</Fragment>
          ) : (
            one
          ),
        )}
      </Text>
    </View>
  );
}
