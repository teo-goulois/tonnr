import { RatingFillIcon, RatingHalfIcon, RatingIcon } from "@repo/ui/icon";
import { type ComponentRef, useRef } from "react";
import { type GestureResponderEvent, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// A session's rating, in stars by halves: decision 043. The three icons are the ones Téo chose,
// the line, the full star and its left half drawn over the line, as the web's `rating.tsx` draws
// them.

// What each whole rating says, from the session to forget to the one to remember.
const WORDS: Record<number, () => string> = {
  1: m.session_rating_1,
  2: m.session_rating_2,
  3: m.session_rating_3,
  4: m.session_rating_4,
  5: m.session_rating_5,
};
const STARS = [1, 2, 3, 4, 5] as const;
const MOST = STARS.length;

// A rating on the half star it is nearest to: an average has any decimals.
const onHalf = (rating: number) => Math.round(rating * 2) / 2;

/** What a rating says: its word when it is whole stars, and its figure between two. */
export function ratingWord(rating: number) {
  return WORDS[rating]?.() ?? m.session_rating_figure({ rating: formatNumber(rating) });
}

/** A rating read aloud: its figure, with its word when it has one. */
export function ratingSaid(rating: number) {
  const word = WORDS[rating]?.();
  return word
    ? m.session_rating_of({ rating, word })
    : m.session_rating_figure({ rating: formatNumber(rating) });
}

/** One star of a rating: full, a line, or its left half over the line. */
function Star({ rating, star, size }: { rating: number; star: number; size: number }) {
  const { colors } = useTheme();
  if (rating >= star)
    return <Glyph icon={RatingFillIcon} size={size} color={colors["neutral-10"]} />;
  return (
    <View style={{ width: size, height: size }}>
      <Glyph icon={RatingIcon} size={size} color={colors["neutral-5"]} />
      {rating >= star - 0.5 ? (
        <View style={{ position: "absolute", inset: 0 }}>
          <Glyph icon={RatingHalfIcon} size={size} color={colors["neutral-10"]} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A rating as it is read: its stars, the given ones full, to the nearest half. Nothing for a
 * session that has none.
 */
export function RatingStars({ rating, size = 14 }: { rating: number | null; size?: number }) {
  if (rating === null) return null;
  const shown = onHalf(rating);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={ratingSaid(rating)}
      style={{ flexDirection: "row", gap: 1 }}
    >
      {STARS.map((star) => (
        <Star key={star} rating={shown} star={star} size={size} />
      ))}
    </View>
  );
}

// Each star is a finger's height, and they stand close: a press beside the one it was meant for
// is set right by sliding.
const STAR_WIDTH = 36;
const STAR_HEIGHT = 44;
const STAR_SIZE = 26;

/**
 * A rating as it is given: five stars, by halves. A press on a star gives it whole, a press on its
 * left half gives half of it, and a finger that slides along the stars fills them as it goes, each
 * half felt. A press on the rating that is given takes it away: a session may be left without one.
 * A screen reader sets it by halves with a swipe up or down.
 */
export function RatingInput({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const box = useRef<ComponentRef<typeof View>>(null);
  // Where the stars stand across the screen, read as a press begins.
  const across = useRef<{ x: number; width: number } | null>(null);
  // What the press began on, and how the finger went: a slide that goes up or down is a scroll.
  const press = useRef<{
    from: number | null;
    moved: boolean;
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  // The rating as it is now, which a press reads between two renders.
  const current = useRef(value);
  current.current = value;

  const set = (next: number | null) => {
    if (next === current.current) return;
    current.current = next;
    feel("select");
    onChange(next);
  };

  // The rating under a finger: each star is two halves, and the least a finger gives is one half.
  const under = (pageX: number) => {
    const at = across.current;
    if (!at || at.width <= 0) return null;
    const stars = ((pageX - at.x) / at.width) * MOST;
    return Math.min(MOST, Math.max(0.5, Math.ceil(stars * 2) / 2));
  };

  const begin = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    press.current = { from: current.current, moved: false, x: pageX, y: pageY, dx: 0, dy: 0 };
    // Measured where the touch's own `pageX` is read, the root view of the screen, which a
    // sheet moves away from the window.
    box.current?.measure((_x, _y, width, _height, x) => {
      across.current = { x, width };
      const next = under(pageX);
      if (next !== null) set(next);
    });
  };

  return (
    <View
      ref={box}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max: MOST,
        now: value ?? 0,
        text: value === null ? m.session_rating_none() : ratingSaid(value),
      }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const now = current.current ?? 0;
        if (event.nativeEvent.actionName === "increment") set(Math.min(MOST, now + 0.5));
        if (event.nativeEvent.actionName === "decrement") set(now - 0.5 <= 0 ? null : now - 0.5);
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      // A finger that goes up or down more than across lets the screen scroll.
      onResponderTerminationRequest={() => {
        const going = press.current;
        return going !== null && Math.abs(going.dy) > Math.abs(going.dx);
      }}
      onResponderGrant={begin}
      onResponderMove={(event) => {
        const going = press.current;
        if (!going) return;
        const { pageX, pageY } = event.nativeEvent;
        going.dx = pageX - going.x;
        going.dy = pageY - going.y;
        const next = under(pageX);
        if (next === null || next === current.current) return;
        going.moved = true;
        set(next);
      }}
      onResponderRelease={(event) => {
        const going = press.current;
        press.current = null;
        // A press that neither moved nor changed anything was on the rating that is given.
        if (
          going &&
          !going.moved &&
          going.from !== null &&
          going.from === under(event.nativeEvent.pageX)
        ) {
          set(null);
        }
      }}
      onResponderTerminate={() => {
        press.current = null;
      }}
      style={{ flexDirection: "row", opacity: disabled ? 0.6 : 1 }}
    >
      {STARS.map((star) => (
        <View
          key={star}
          pointerEvents="none"
          style={{
            width: STAR_WIDTH,
            height: STAR_HEIGHT,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Star rating={value ?? 0} star={star} size={STAR_SIZE} />
        </View>
      ))}
    </View>
  );
}
