import type { SurfSize } from "@repo/client/sessions/types";
import { scaleColor, WAVE_HEIGHT_SCALE } from "@repo/client/sea-scales";
import { SIZES, SURF_FACES } from "@repo/conditions/sessions/sizes";
import { SurferFillIcon, WaveFillIcon } from "@repo/ui/icon";
import { isValidElement, type ReactElement, type ReactNode, useId } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
} from "react-native-svg";

import type { GlyphIcon } from "@/components/shared/glyph";
import { drawTree, type SvgRenderer } from "@/components/shared/svg-tree";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { heightFigure, heightUnit, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

// How big the waves of a session looked, said by its surfer against a body: decision 043. The
// pictures are the web's `SurfSizePicture`, drawn with react-native-svg from the same two icons of
// Nucleo, to one scale.

const NAMES: Record<SurfSize, () => string> = {
  ankle: m.surf_size_ankle,
  knee: m.surf_size_knee,
  waist: m.surf_size_waist,
  chest: m.surf_size_chest,
  shoulder: m.surf_size_shoulder,
  head: m.surf_size_head,
  overhead: m.surf_size_overhead,
  double_overhead: m.surf_size_double_overhead,
  triple_overhead: m.surf_size_triple_overhead,
};

export const sizeName = (size: SurfSize) => NAMES[size]();

/** The height of face a size stands for, in the reader's unit: "0.6–1 m", or "13 ft+". */
export function sizeFace(size: SurfSize) {
  const { least, most } = SURF_FACES[size];
  // A foot is small enough to be said whole.
  const digits = heightUnit() === m.unit_ft() ? 0 : 1;
  return most === null
    ? `${heightFigure(least, digits)} ${heightUnit()}+`
    : `${heightFigure(least, digits)}–${heightFigure(most, digits)} ${heightUnit()}`;
}

/** What was said of a session's waves, in a few words: "Chest · Overhead". */
export function sizesWords(waves: SurfSize | null, sets: SurfSize | null) {
  if (waves && sets && waves !== sets) return `${sizeName(waves)} · ${sizeName(sets)}`;
  const one = waves ?? sets;
  return one ? sizeName(one) : null;
}

// The picture's box: a surfer stands on the left, the wave rises on the right, its lip towards them.
const WIDTH = 100;
const HEIGHT = 64;
const WATER = 58;
const TOP = 6;
// The surfer, in metres, against whom every size is said.
const SURFER = 1.75;

// What the two icons draw of their box of 18: the person from their head to their feet, and the
// wave from its crest down to the flat water it rises from, cut there from the curves under it.
const PERSON = { left: 4.6, top: 0, wide: 8.8, high: 18 };
const WAVE = { left: 1, top: 2.1, wide: 16, high: 8.3 };
// Where the wave begins, and how far its width follows its height: a small wave is stretched a
// little, so that it is not drawn too narrow to be read, and a big one no wider than the box.
const WAVE_LEFT = 30;
const WAVE_STRETCH = { least: 1.6, most: 4.4 };
// Room over the surfer, which keeps them a little short of the top of a picture of small waves.
const HEADROOM = 1.2;
// The least a wave is drawn: an ankle's, drawn to the surfer's scale, would be a line.
const LEAST_WAVE = 8;

// The shapes of the two icons, drawn inside a picture of their own rather than as icons.
const SHAPES: SvgRenderer = {
  svg: G,
  g: G,
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  line: Line,
  polygon: Polygon,
  rect: Rect,
};

/** What an icon draws inside its `<svg>`, to be placed in another picture. */
function shapesOf(icon: GlyphIcon, color: string): ReactNode {
  let node = icon({}) as ReactNode;
  for (let depth = 0; depth < 8 && isValidElement(node); depth += 1) {
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.type === "svg") {
      return drawTree(element.props.children as ReactNode, SHAPES, { size: 0, color });
    }
    if (typeof element.type !== "function") return null;
    node = (element.type as (props: Record<string, unknown>) => ReactNode)(element.props);
  }
  return null;
}

/** A surfer standing, drawn from their feet at (x, WATER), `tall` units tall. */
function Surfer({ x, tall, color }: { x: number; tall: number; color: string }) {
  const scale = tall / PERSON.high;
  const wide = PERSON.wide * scale;
  return (
    <G
      color={color}
      transform={`translate(${x - wide / 2} ${WATER - tall}) scale(${scale}) translate(${-PERSON.left} ${-PERSON.top})`}
    >
      {shapesOf(SurferFillIcon, color)}
    </G>
  );
}

/** A wave whose crest stands `high` units over the water, turned so that it breaks to the left. */
function Wave({
  high,
  shift = 0,
  color,
  opacity = 1,
  clip,
}: {
  high: number;
  shift?: number;
  color: string;
  opacity?: number;
  clip: string;
}) {
  const upright = high / WAVE.high;
  const across = Math.min(Math.max(upright, WAVE_STRETCH.least), WAVE_STRETCH.most);
  const wide = WAVE.wide * across;
  // A wave drawn behind stands a little further, never past the right of the box.
  const left = Math.min(WAVE_LEFT + shift, WIDTH - wide);
  const top = WATER - high;
  return (
    <G transform={`translate(${2 * left + wide} 0) scale(-1 1)`}>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={left} y={top} width={wide} height={high} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`} opacity={opacity}>
        <G
          color={color}
          transform={`translate(${left} ${top}) scale(${wide / WAVE.wide} ${high / WAVE.high}) translate(${-WAVE.left} ${-WAVE.top})`}
        >
          {shapesOf(WaveFillIcon, color)}
        </G>
      </G>
    </G>
  );
}

/**
 * A size drawn: a surfer of 1.75 m beside a wave of its height of face, both to one scale, so
 * that the wave is read against the body. A bigger set may be drawn behind it, paler.
 */
export function SurfSizePicture({ size, behind }: { size: SurfSize; behind?: SurfSize | null }) {
  const { colors } = useTheme();
  // An id of the picture's own for each wave's edge: several pictures stand on one screen.
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const face = SURF_FACES[size].drawn;
  const back = behind ? SURF_FACES[behind].drawn : 0;
  // The scale fits the tallest of the surfer and the waves in the box.
  const perMeter = (WATER - TOP) / Math.max(SURFER * HEADROOM, face, back);

  return (
    <Svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", aspectRatio: WIDTH / HEIGHT }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {back > face ? (
        <Wave
          high={back * perMeter}
          shift={8}
          color={scaleColor(WAVE_HEIGHT_SCALE, back)}
          opacity={0.4}
          clip={`${id}-back`}
        />
      ) : null}
      <Wave
        high={Math.max(face * perMeter, LEAST_WAVE)}
        color={scaleColor(WAVE_HEIGHT_SCALE, face)}
        clip={`${id}-face`}
      />
      <Line
        x1={0}
        x2={WIDTH}
        y1={WATER}
        y2={WATER}
        stroke={colors["neutral-10"]}
        strokeOpacity={0.25}
        strokeWidth={0.75}
      />
      <Surfer x={16} tall={SURFER * perMeter} color={colors["neutral-10"]} />
    </Svg>
  );
}

type SizeChoicesProps = {
  /** What the choices are, for a screen reader: most waves, or the sets. */
  label: string;
  value: SurfSize | null;
  /** The least that may be chosen: the sets are never smaller than the waves. */
  least?: SurfSize | null;
  /** The waves already said, drawn in front of each set. */
  front?: SurfSize | null;
  onPick: (size: SurfSize) => void;
};

/** The nine sizes as pictures to press, three by three, those under `least` not to be chosen. */
export function SizeChoices({ label, value, least, front, onPick }: SizeChoicesProps) {
  useUnits();
  const { colors, space, radius, border } = useTheme();
  const from = least ? SIZES.indexOf(least) : 0;
  const rows = [SIZES.slice(0, 3), SIZES.slice(3, 6), SIZES.slice(6, 9)];

  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ gap: space.xs }}>
      {rows.map((row) => (
        <View key={row.join()} style={{ flexDirection: "row", gap: space.xs }}>
          {row.map((size) => {
            const chosen = size === value;
            const disabled = SIZES.indexOf(size) < from;
            return (
              <Pressable
                key={size}
                accessibilityRole="radio"
                accessibilityLabel={`${sizeName(size)}, ${sizeFace(size)}`}
                accessibilityState={{ checked: chosen, disabled }}
                disabled={disabled}
                onPress={() => {
                  feel("select");
                  onPick(size);
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  gap: space.xxs,
                  padding: space.xs,
                  borderRadius: radius.xs,
                  borderCurve: "continuous",
                  borderWidth: chosen ? border.m : border.s,
                  borderColor: chosen ? colors["neutral-10"] : colors["neutral-4"],
                  backgroundColor: chosen || pressed ? colors["neutral-3"] : "transparent",
                  opacity: disabled ? 0.35 : 1,
                })}
              >
                <SurfSizePicture size={front ?? size} behind={front ? size : null} />
                <Text
                  size="s"
                  weight="medium"
                  dense
                  numberOfLines={2}
                  style={{ textAlign: "center" }}
                >
                  {sizeName(size)}
                </Text>
                <Text
                  size="xs"
                  tone="muted"
                  numeric
                  dense
                  numberOfLines={1}
                  style={{ textAlign: "center" }}
                >
                  {sizeFace(size)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
