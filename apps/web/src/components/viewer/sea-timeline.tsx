import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import { ChevronLeftIcon, ChevronRightIcon } from "@repo/ui/icon";
import { useEffect, useMemo, useState } from "react";

import { formatDayAndClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// How long the thumb rests on an instant before the map shows it. Dragging across a week passes
// over dozens of instants, and the map asks the provider for none of those it only crosses.
const SETTLE_MS = 150;

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
};

/** The instant the sea is shown at, on a line of the days ahead that a thumb runs along. */
export function SeaTimeline({ time, times, onTimeChange }: SeaTimelineProps) {
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

  const step = (steps: number) => {
    setScrubbed(null);
    onTimeChange(shown + steps * stepMs);
  };
  const place = (instant: number) => `${((instant - earliest) / (latest - earliest)) * 100}%`;
  const label = (instant: number) =>
    instant === present ? m.map_sea_now() : formatDayAndClock(new Date(instant));

  // Each midnight of the line, by the clock of the reader.
  const days = useMemo(() => {
    const midnights: Date[] = [];
    const day = new Date(earliest);
    day.setHours(24, 0, 0, 0);
    for (; day.getTime() <= latest; day.setTime(day.getTime() + DAY_MS)) {
      midnights.push(new Date(day));
    }
    return midnights;
  }, [earliest, latest]);

  return (
    <div className="grid gap-xxs">
      <div className="flex items-center gap-xxs">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.map_sea_earlier()}
          disabled={shown - stepMs < earliest}
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon data-slot="icon" aria-hidden />
        </Button>
        <span className="flex-1 text-center text-s tabular-nums" aria-live="polite">
          {label(shown)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.map_sea_later()}
          disabled={shown + stepMs > latest}
          onClick={() => step(1)}
        >
          <ChevronRightIcon data-slot="icon" aria-hidden />
        </Button>
        {shown !== present && (
          <Button variant="secondary" size="xs" onClick={() => step((present - shown) / stepMs)}>
            {m.map_sea_now()}
          </Button>
        )}
      </div>

      {/* The thumb's middle marks the instant, so the line stops half a thumb short of each end. */}
      <div className="px-2.5 sm:px-2">
        <Slider
          value={shown}
          min={earliest}
          max={latest}
          step={stepMs}
          largeStep={DAY_MS}
          thumbAlignment="center"
          onValueChange={(value) => typeof value === "number" && setScrubbed(value)}
          getAriaLabel={() => m.map_sea_time()}
          getAriaValueText={(_formatted, value) => label(value)}
        />
        <div className="relative h-(--line-xs) text-xs text-neutral-7 tabular-nums" aria-hidden>
          <span
            className="absolute -top-2 h-1 w-px bg-neutral-7"
            style={{ left: place(present) }}
          />
          {days.map((day) => (
            <span
              key={day.getTime()}
              className="absolute -translate-x-1/2"
              style={{ left: place(day.getTime()) }}
            >
              {day.getDate()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
