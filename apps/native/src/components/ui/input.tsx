import { InfoIcon } from "@repo/ui/icon";
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  type StyleProp,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

import { IconButton } from "./button";
import { edge } from "./edge";
import { TARGET } from "./metrics";
import { Text } from "./text";
import { useTell } from "./toast";

type ViewRef = ComponentRef<typeof View>;

// A line of text typed in a panel, as the web's `Input` draws it on a phone: on the theme's
// surface inside a fine line of its fourth grey, which the line turns to the theme's red while
// what was typed is refused, and its third grey while it cannot be typed in. While it is written
// in, its line fades and the web's focus ring stands two points outside it. It is the web's
// field's height, the body's line and a step of room above and under it, which a finger reaches
// all the same, and grows with Dynamic Type; its text is 16 points, as the web writes a field on
// a phone. `Textarea` is the same field for several lines, at the smaller radius.
//
// `Field` is the web's form field around a control: its name over it in the body's medium, what
// it says of itself under it in the muted small type, and, once something is wrong, what is wrong
// in the theme's red in its place, with what it said behind a small button. A screen reader hears
// the control by its name, with what is wrong or what it says as its hint, and is told a fault
// as it comes; the control shakes lightly as it becomes wrong, unless the reader asked for no
// motion. What sends a form is never disabled to stop a wrong one: the field says what is wrong
// (decision 076). The form kit, `form.tsx`, draws its fields with these.

/** What a field tells the control it holds: its name, its fault, what it says. */
type FieldState = { label?: string | undefined; hint?: string | undefined; invalid: boolean };

const FieldContext = createContext<FieldState | null>(null);

/** The field a control stands in, if any. */
export function useFieldState(): FieldState | null {
  return useContext(FieldContext);
}

// The web's light shake of a field that becomes wrong (`useInvalidShake`): three points, two,
// one, back, over 300 ms on its easing.
const SHAKE = [-3, 2, -1, 0];
const SHAKE_MS = 300;
const SHAKE_EASING = Easing.bezier(0.25, 0.46, 0.45, 0.94);

/** A shake to play on what a field holds, which does nothing for a reader who asked for no motion. */
export function useShake() {
  const still = useReducedMotion();
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const shake = () => {
    if (still) return;
    const step = SHAKE_MS / SHAKE.length;
    x.set(
      withSequence(...SHAKE.map((to) => withTiming(to, { duration: step, easing: SHAKE_EASING }))),
    );
  };
  return { style, shake };
}

/** What a form asks of a field: to shake again, and where its name and its control stand. */
export type FieldHandle = {
  shake: () => void;
  /** Its name, which a screen reader is moved to where no control of its own takes the focus. */
  label: ViewRef | null;
  /** What it holds, which is scrolled into view. */
  control: ViewRef | null;
};

type FieldProps = {
  /** Its name, over the control or, `inline`, at the start of its line. */
  label?: string | undefined;
  /** What it says of itself, under the control, until something is wrong. */
  description?: string | undefined;
  /** What is wrong with what it holds, under the control in the theme's red. */
  error?: string | undefined;
  /** The name over the control, or beside it on one line: a row of a group, a switch. */
  layout?: "stacked" | "inline";
  /** The room between its name, its control and what it says: the theme's small step by default. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  handle?: Ref<FieldHandle>;
  children: ReactNode;
};

export function Field({
  label,
  description,
  error,
  layout = "stacked",
  gap,
  style,
  handle,
  children,
}: FieldProps) {
  const { space } = useTheme();
  const invalid = error !== undefined && error !== "";
  const { style: shaken, shake } = useShake();
  const labelRef = useRef<ViewRef>(null);
  const controlRef = useRef<ViewRef>(null);

  useImperativeHandle(
    handle,
    () => ({
      shake,
      get label() {
        return labelRef.current;
      },
      get control() {
        return controlRef.current;
      },
    }),
    [shake],
  );

  // It shakes as it becomes wrong, and a screen reader is told what is wrong as it comes: iOS
  // reads no live region, so it is said there in words.
  const was = useRef(invalid);
  useEffect(() => {
    const became = invalid && !was.current;
    was.current = invalid;
    if (!became) return;
    shake();
    if (Platform.OS === "ios" && error) {
      AccessibilityInfo.announceForAccessibilityWithOptions(error, { queue: true });
    }
  }, [invalid, error, shake]);

  const state: FieldState = { label, hint: invalid ? error : description, invalid };
  const name = label ? (
    // The control is named by it: a screen reader reads it there, not twice.
    <View ref={labelRef} accessible={false}>
      <Text
        weight={layout === "stacked" ? "medium" : "regular"}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
    </View>
  ) : null;
  // What it holds is measured on a view of its own: an animated view's ref is not the view.
  const control = (
    <Animated.View style={[layout === "inline" ? { flexShrink: 1 } : null, shaken]}>
      <View ref={controlRef} collapsable={false}>
        {children}
      </View>
    </Animated.View>
  );

  return (
    <FieldContext.Provider value={state}>
      <View style={[{ gap: gap ?? space.xs, minWidth: 0 }, style]}>
        {layout === "inline" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.s,
            }}
          >
            {name}
            {control}
          </View>
        ) : (
          <>
            {name}
            {control}
          </>
        )}
        <FieldMessage description={description} error={invalid ? error : undefined} />
      </View>
    </FieldContext.Provider>
  );
}

/**
 * What a field says under its control, as the web's `FormFieldMessage`: what it says of itself,
 * or what is wrong in its place, with what it said behind a small button beside it.
 */
function FieldMessage({
  description,
  error,
}: {
  description?: string | undefined;
  error?: string | undefined;
}) {
  const { space } = useTheme();
  const tell = useTell();
  if (error) {
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs }}>
        {/* Read with the control, as its hint: a screen reader is not given it twice. */}
        <Text
          size="s"
          tone="danger"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1 }}
        >
          {error}
        </Text>
        {description ? (
          <IconButton
            icon={InfoIcon}
            label={description}
            variant="ghost"
            size="xs"
            muted
            iconSize={14}
            onPress={() => tell({ title: description })}
            style={{ marginVertical: -space.s, marginRight: -space.s }}
          />
        ) : null}
      </View>
    );
  }
  return description ? (
    <Text
      size="s"
      tone="muted"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {description}
    </Text>
  ) : null;
}

type InputProps = Omit<TextInputProps, "style"> & {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  /** What was typed is refused: its line is drawn in the theme's red. Its field says it otherwise. */
  invalid?: boolean;
  /** Read and copied, never typed in, as a link to share: drawn as a field that can be. */
  readOnly?: boolean;
  /** A word at its end, inside it, that is not typed: the "°" of a bearing. */
  end?: string;
};

/** A line of text typed in a panel. */
export function Input(props: InputProps) {
  return <TextBox {...props} lines="one" />;
}

/** Several lines of text typed in a panel, which grows with what is typed. */
export function Textarea(props: Omit<InputProps, "end" | "multiline">) {
  return <TextBox {...props} lines="several" />;
}

// The web's textarea on a phone, `max-sm:min-h-20.5`, which a skeleton of one takes too.
export const TEXTAREA_LEAST = 82;

function TextBox({
  ref,
  invalid,
  readOnly = false,
  editable = true,
  end,
  lines,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...props
}: InputProps & { lines: "one" | "several" }) {
  const { colors, fonts, space, type, radius } = useTheme();
  const field = useFieldState();
  const [focused, setFocused] = useState(false);
  const own = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => own.current as ComponentRef<typeof TextInput>, []);

  const disabled = !editable && !readOnly;
  const wrong = invalid ?? field?.invalid ?? false;
  const several = lines === "several";
  const height = several ? TEXTAREA_LEAST : type.m.line + 2 * space.xs;
  const slop = Math.ceil(Math.max(0, TARGET - height) / 2);
  const line = wrong
    ? colors.error
    : disabled
      ? colors["neutral-4-transparent"]
      : focused && !readOnly
        ? colors["color-1-transparent"]
        : colors["neutral-4"];

  return (
    // A finger that lands just outside it still writes in it, as a button's reach is wider than
    // what is drawn.
    <Pressable
      accessible={false}
      hitSlop={{ top: slop, bottom: slop }}
      onPress={() => own.current?.focus()}
      style={[
        {
          // As wide as what holds it, and in a line with a button, the room the button leaves.
          flexGrow: 1,
          flexShrink: 1,
          minHeight: height,
          flexDirection: "row",
          alignItems: several ? "stretch" : "center",
          borderRadius: several ? radius.xs : radius.s,
          borderCurve: "continuous",
          backgroundColor: disabled ? colors["neutral-3"] : colors["neutral-1"],
        },
        edge(line, { inset: true }),
        focused && !readOnly
          ? {
              outlineColor: colors["focus-ring"],
              outlineStyle: "solid",
              outlineWidth: 2,
              outlineOffset: 2,
            }
          : null,
      ]}
    >
      <TextInput
        ref={own}
        editable={editable && !readOnly}
        readOnly={readOnly}
        selectTextOnFocus={readOnly}
        multiline={several}
        scrollEnabled={!several}
        textAlignVertical={several ? "top" : "center"}
        placeholderTextColor={colors["neutral-6"]}
        selectionColor={colors["color-1"]}
        cursorColor={colors["color-1"]}
        accessibilityLabel={accessibilityLabel ?? field?.label}
        accessibilityHint={accessibilityHint ?? field?.hint}
        accessibilityState={{ disabled }}
        aria-invalid={wrong || undefined}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={{
          flex: 1,
          minHeight: height,
          paddingHorizontal: space.s,
          paddingVertical: space.xs,
          paddingRight: end ? space.xxs : space.s,
          fontFamily: fonts.regular,
          // A phone's field is written at 16 points, which the web gives it under `lg` too: iOS
          // would zoom a page on a smaller one.
          fontSize: Math.max(type.m.size, 16),
          lineHeight: several ? type.m.line : undefined,
          color: disabled ? colors["neutral-6"] : colors["neutral-10"],
        }}
        {...props}
      />
      {end ? (
        <Text
          tone="muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ paddingRight: space.s, fontSize: Math.max(type.m.size, 16) }}
        >
          {end}
        </Text>
      ) : null}
    </Pressable>
  );
}
