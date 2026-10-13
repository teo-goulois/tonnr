import { RatingFillIcon, RatingIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { m } from "@/paraglide/messages.js";

// What each rating says, from the session to forget to the one to remember.
const WORDS: Record<number, () => string> = {
  1: m.session_rating_1,
  2: m.session_rating_2,
  3: m.session_rating_3,
  4: m.session_rating_4,
  5: m.session_rating_5,
};
const STARS = [1, 2, 3, 4, 5] as const;

/** What a rating says, in a word. */
export function ratingWord(rating: number) {
  return WORDS[rating]?.() ?? "";
}

/** A rating as it is read: its stars, the given ones full. Nothing for a session that has none. */
export function RatingStars({ rating, className }: { rating: number | null; className?: string }) {
  if (rating === null) return null;
  return (
    <span
      role="img"
      aria-label={m.session_rating_of({ rating, word: ratingWord(rating) })}
      className={cn("inline-flex shrink-0 items-center gap-px text-neutral-10", className)}
    >
      {STARS.map((star) =>
        star <= rating ? (
          <RatingFillIcon key={star} aria-hidden className="size-3.5" />
        ) : (
          <RatingIcon key={star} aria-hidden className="size-3.5 text-neutral-5" />
        ),
      )}
    </span>
  );
}

/**
 * A rating as it is given: five stars, one press each, and the word of the one that is chosen.
 * A press on the rating that is given takes it away: a session may be left without one.
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
  return (
    <div className="flex flex-wrap items-center gap-x-s gap-y-xxs">
      <div role="group" aria-label={label} className="-ml-1.5 flex">
        {STARS.map((star) => {
          const isGiven = value !== null && star <= value;
          return (
            <button
              key={star}
              type="button"
              // Pressed is the rating that is given: the stars before it are drawn full with it.
              aria-pressed={value === star}
              aria-label={m.session_rating_of({ rating: star, word: ratingWord(star) })}
              disabled={disabled}
              className={cn(
                // A star is as wide as a finger.
                "focus-ring grid size-11 cursor-pointer place-items-center rounded-full outline-none",
                "transition-transform duration-(--motion-duration) ease-theme motion-safe:active:scale-90",
                "disabled:cursor-default disabled:opacity-60",
                isGiven ? "text-neutral-10" : "text-neutral-5 hover:text-neutral-7",
              )}
              onClick={() => onChange(value === star ? null : star)}
            >
              {isGiven ? (
                <RatingFillIcon aria-hidden className="size-7" />
              ) : (
                <RatingIcon aria-hidden className="size-7" />
              )}
            </button>
          );
        })}
      </div>
      <span aria-hidden className="text-s text-neutral-7">
        {value === null ? m.session_rating_none() : ratingWord(value)}
      </span>
    </div>
  );
}
