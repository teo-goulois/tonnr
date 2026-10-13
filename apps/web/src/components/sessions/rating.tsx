import { RatingFillIcon, RatingHalfIcon, RatingIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type PointerEvent, useRef } from "react";

import { formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

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

// A rating read aloud: its figure, with its word when it has one.
function ratingSaid(rating: number) {
  const word = WORDS[rating]?.();
  return word
    ? m.session_rating_of({ rating, word })
    : m.session_rating_figure({ rating: formatNumber(rating) });
}

/** One star of a rating: full, a line, or its left half over the line. */
function Star({ rating, star, className }: { rating: number; star: number; className?: string }) {
  if (rating >= star) return <RatingFillIcon aria-hidden className={className} />;
  return (
    <span className={cn("relative grid", className)}>
      <RatingIcon aria-hidden className="size-full text-neutral-5" />
      {rating >= star - 0.5 && (
        <RatingHalfIcon aria-hidden className="absolute inset-0 size-full" />
      )}
    </span>
  );
}

/**
 * A rating as it is read: its stars, the given ones full, to the nearest half. Nothing for a
 * session that has none.
 */
export function RatingStars({ rating, className }: { rating: number | null; className?: string }) {
  if (rating === null) return null;
  const shown = onHalf(rating);
  return (
    <span
      role="img"
      aria-label={ratingSaid(rating)}
      className={cn("inline-flex shrink-0 items-center gap-px text-neutral-10", className)}
    >
      {STARS.map((star) => (
        <Star key={star} rating={shown} star={star} className="size-3.5" />
      ))}
    </span>
  );
}

/**
 * A rating as it is given: five stars, by halves. A press on a star gives it whole, a press on
 * its left half gives half of it, and a finger that slides along the stars fills them as it
 * goes. A press on the rating that is given takes it away: a session may be left without one.
 */
export function RatingInput({
  value,
  onChange,
  label,
  disabled = false,
  className,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  // What the press began on, to tell a press on the given rating from a slide that ends on it.
  const pressed = useRef<{ from: number | null; moved: boolean } | null>(null);

  // The rating under a finger: each star is two halves, and the least a finger gives is one half.
  const under = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const stars = ((event.clientX - box.left) / box.width) * MOST;
    return Math.min(MOST, Math.max(0.5, Math.ceil(stars * 2) / 2));
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={MOST}
      aria-valuenow={value ?? 0}
      aria-valuetext={value === null ? m.session_rating_none() : ratingSaid(value)}
      aria-disabled={disabled || undefined}
      className={cn(
        // A finger that slides along the stars rates, and one that goes up or down scrolls.
        "focus-ring flex cursor-pointer touch-pan-y rounded-full outline-none select-none",
        disabled && "cursor-default opacity-60",
        className,
      )}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pressed.current = { from: value, moved: false };
        const next = under(event);
        if (next !== value) onChange(next);
      }}
      onPointerMove={(event) => {
        if (!pressed.current) return;
        const next = under(event);
        if (next === value) return;
        pressed.current.moved = true;
        onChange(next);
      }}
      onPointerUp={(event) => {
        const press = pressed.current;
        pressed.current = null;
        // A press that neither moved nor changed anything was on the rating that is given.
        if (press && !press.moved && press.from === under(event)) onChange(null);
      }}
      onPointerCancel={() => {
        pressed.current = null;
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const now = value ?? 0;
        const next =
          event.key === "ArrowRight" || event.key === "ArrowUp"
            ? Math.min(MOST, now + 0.5)
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? now - 0.5
              : event.key === "Home" || event.key === "Backspace" || event.key === "Delete"
                ? 0
                : event.key === "End"
                  ? MOST
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        onChange(next <= 0 ? null : next);
      }}
    >
      {STARS.map((star) => (
        // The stars stand close to one another, and each is as tall as a finger: a press that
        // lands beside the one it was meant for is set right by sliding.
        <span key={star} className="grid h-10 w-7.5 place-items-center">
          <Star rating={value ?? 0} star={star} className="size-6" />
        </span>
      ))}
    </div>
  );
}
