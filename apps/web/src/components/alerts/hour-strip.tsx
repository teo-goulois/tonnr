import { cn } from "@repo/ui/lib/utils";

import { formatDay } from "@/lib/format";

type Stretch = { start: Date; end: Date };

type HourStripProps = {
  // The hours ahead, with the conditions each does not meet.
  hours: { time: Date; unmet: string[] }[];
  // The hours the account can use, among those the sea is there.
  open: Stretch[];
  // The time zone the days are the account's in. Left out, the browser's.
  zone?: string;
  // What the strip shows, in words: the hours that are full.
  label: string;
};

/**
 * The hours ahead as one strip, a day at a time: an hour is full when the sea is there at an
 * hour the account can go, grey when the sea is there and the account cannot, and empty
 * otherwise.
 */
export function HourStrip({ hours, open, zone, label }: HourStripProps) {
  const days = new Map<string, HourStripProps["hours"]>();
  for (const hour of hours) {
    const day = formatDay(hour.time, zone);
    days.set(day, [...(days.get(day) ?? []), hour]);
  }
  const isOpen = (time: Date) => open.some((piece) => piece.start <= time && time < piece.end);

  return (
    <div role="img" aria-label={label} className="flex gap-xxs">
      {[...days.entries()].map(([day, ofDay]) => (
        <div key={day} className="grid min-w-0 gap-xxs" style={{ flex: ofDay.length }}>
          <div className="flex h-4 overflow-hidden rounded-(--radius-xs) bg-neutral-3">
            {ofDay.map((hour) => (
              <span
                key={hour.time.getTime()}
                className={cn(
                  "flex-1",
                  hour.unmet.length === 0 && (isOpen(hour.time) ? "bg-color-1" : "bg-neutral-5"),
                )}
              />
            ))}
          </div>
          <span className="truncate text-xxs text-neutral-7">{day}</span>
        </div>
      ))}
    </div>
  );
}
