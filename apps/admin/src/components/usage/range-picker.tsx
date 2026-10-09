import { cn } from "@repo/ui/lib/utils";

import { RANGE_NAMES, type RangeName } from "@/lib/usage";
import { m } from "@/paraglide/messages.js";

const LABELS: Record<RangeName, () => string> = {
  day: m.range_day,
  week: m.range_week,
  month: m.range_month,
  year: m.range_year,
};

type RangePickerProps = {
  value: RangeName;
  onChange: (range: RangeName) => void;
};

/** How far back the counts on screen go. One choice for every count of the screen. */
export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div
      role="group"
      aria-label={m.range_label()}
      className="edge inline-flex rounded-(--radius-xs) p-0.5"
    >
      {RANGE_NAMES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={range === value}
          onClick={() => onChange(range)}
          className={cn(
            // structure & layout
            "h-8 cursor-pointer rounded-(--radius-xs) px-s",
            // typography
            "text-s font-medium whitespace-nowrap text-neutral-7",
            // focus
            "focus-ring outline-none",
            // transitions
            "transition-colors duration-(--motion-duration) ease-theme",
            // state: hover and the range chosen
            "hover:text-neutral-10 aria-pressed:bg-neutral-3 aria-pressed:text-neutral-10",
          )}
        >
          {LABELS[range]()}
        </button>
      ))}
    </div>
  );
}
