import { Button } from "@repo/ui/components/ui/button";
import { SliderPrimitive } from "@repo/ui/components/ui/slider";
import { cn } from "@repo/ui/lib/utils";
import { type Ref, useEffect, useMemo, useState } from "react";

import { formatDay, formatDayAndClock, formatWeekday } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// How long the thumb rests on an instant before the map shows it. Dragging across a week passes
// over dozens of instants, and the map asks the provider for none of those it only crosses.
const SETTLE_MS = 80;

/** The instants the sea can be shown at: a day back, and as far ahead as the model goes. */
export type SeaTimes = {
  // The model's latest field that is not in the future.
  present: number;
  earliest: number;
  latest: number;
  stepMs: number;
};

type SeaTimelineProps = {
  time: Date;
  times: SeaTimes;
  onTimeChange: (time: number) => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/**
 * The instant the sea is shown at, on a strip of the days ahead: one bar for each instant of the
 * model, the days named above them, and a thumb that runs along.
 */
export function SeaTimeline({ time, times, onTimeChange, className, ref }: SeaTimelineProps) {
  const { present, earliest, latest, stepMs } = times;
  // Where the thumb is while it moves, ahead of the map.
  const [scrubbed, setScrubbed] = useState<number | null>(null);
  const shown = scrubbed ?? time.getTime();

  useEffect(() => {
    if (scrubbed === null) return;
    const settle = setTimeout(() => {
      onTimeChange(scrubbed);
      setScrubbed(null);
    }, SETTLE_MS);
    return () => clearTimeout(settle);
  }, [scrubbed, onTimeChange]);

  const instants = useMemo(
    () =>
      Array.from(
        { length: Math.round((latest - earliest) / stepMs) + 1 },
        (_, index) => earliest + index * stepMs,
      ),
    [earliest, latest, stepMs],
  );
  // Each instant has a bar as wide as the others, and stands in the middle of its own.
  const place = (instant: number) =>
    `${(((instant - earliest) / stepMs + 0.5) / instants.length) * 100}%`;
  const halfBar = `${50 / instants.length}%`;
  const label = (instant: number) =>
    instant === present ? m.map_sea_now() : formatDayAndClock(new Date(instant));

  // The days of the strip, each from its midnight by the clock of the reader. The first one starts
  // with the strip.
  const days = useMemo(() => {
    const midnight = new Date(earliest);
    midnight.setHours(24, 0, 0, 0);
    // What is left of the first day is named when it is long enough to hold a name.
    const starts =
      midnight.getTime() - earliest > DAY_MS / 2 ? [new Date(earliest - stepMs / 2)] : [];
    for (; midnight.getTime() <= latest; midnight.setTime(midnight.getTime() + DAY_MS)) {
      starts.push(new Date(midnight));
    }
    return starts;
  }, [earliest, latest, stepMs]);

  return (
    <div
      className={cn(
        "edge flex items-end gap-xs rounded-(--radius-xs) bg-neutral-1 p-xs text-neutral-10",
        "[--edge-color:var(--neutral-10-transparent)]",
        className,
      )}
      ref={ref}
    >
      <Button
        variant="secondary"
        size="xs"
        disabled={shown === present}
        onClick={() => {
          setScrubbed(null);
          onTimeChange(present);
        }}
      >
        {m.map_sea_now()}
      </Button>

      <SliderPrimitive.Root
        className="relative min-w-0 flex-1"
        value={shown}
        min={earliest}
        max={latest}
        step={stepMs}
        largeStep={DAY_MS}
        thumbAlignment="center"
        onValueChange={(value) => typeof value === "number" && setScrubbed(value)}
      >
        <div className="relative h-(--line-s) overflow-hidden text-xs text-neutral-7" aria-hidden>
          {days.map((day) => (
            <span
              key={day.getTime()}
              className={cn(
                "absolute inset-y-0 pl-xxs whitespace-nowrap",
                day.getTime() > earliest && "border-l border-neutral-4",
              )}
              style={{ left: place(day.getTime()) }}
            >
              {/* A phone has room for the day's name alone. */}
              <span className="lg:hidden">{formatWeekday(new Date(day.getTime() + stepMs))}</span>
              <span className="max-lg:hidden">{formatDay(new Date(day.getTime() + stepMs))}</span>
            </span>
          ))}
          {/* The instant shown, over the name of its day. It stays inside the strip at both ends. */}
          <span
            className="absolute inset-y-0 -translate-x-1/2 rounded-full bg-neutral-10 px-xs whitespace-nowrap text-neutral-1 tabular-nums"
            style={{ left: `clamp(3rem, ${place(shown)}, calc(100% - 3rem))` }}
          >
            {label(shown)}
          </span>
        </div>

        <SliderPrimitive.Control className="relative mt-xxs flex h-4 cursor-pointer lg:h-6 touch-none select-none">
          <div className="pointer-events-none absolute inset-0 flex" aria-hidden>
            {instants.map((instant) => (
              <span key={instant} className="flex-1 px-px">
                <span
                  className={cn(
                    "block h-full rounded-full",
                    instant < present && "bg-neutral-3",
                    instant === present && "bg-neutral-7",
                    instant > present && "bg-neutral-4",
                  )}
                />
              </span>
            ))}
          </div>
          {/* The thumb's middle runs from the middle of the first bar to the middle of the last. */}
          <div className="absolute inset-y-0" style={{ left: halfBar, right: halfBar }}>
            <SliderPrimitive.Track className="size-full">
              <SliderPrimitive.Thumb
                className={cn(
                  "h-full rounded-full bg-neutral-10 outline-none",
                  "has-focus-visible:[outline:var(--focus-ring-outline)] has-focus-visible:outline-offset-2",
                )}
                style={{ width: `calc(${100 / (instants.length - 1)}% - 2px)` }}
                getAriaLabel={() => m.map_sea_time()}
                getAriaValueText={(_formatted, value) => label(value)}
              />
            </SliderPrimitive.Track>
          </div>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}
