import { formatClock, formatDay } from "@/lib/format";
import type { SpotTide } from "@/lib/pages-api";
import { formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { SpotSection } from "./spot-frame";

// The next highs and lows at a surf break, in its own time zone, UTC when it has none. The
// hours are the station's prediction, as the map computes them. Decision 057.

/**
 * The next tides, each with its day, its hour and its height. A break with no time zone says
 * that the hours are UTC.
 */
export function NextTides({ tide, timezone }: { tide: SpotTide | null; timezone: string | null }) {
  useUnits();
  const zone = timezone ?? "UTC";
  return (
    <SpotSection title={m.page_next_tides()} note={timezone ? undefined : m.page_tide_utc()}>
      {tide && tide.extremes.length > 0 ? (
        <ul className="grid gap-xxs">
          {tide.extremes.map((extreme) => (
            <li
              key={extreme.time.toISOString()}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-m rounded-(--radius-xs) bg-neutral-2 px-m py-xs tabular-nums"
            >
              <span className="font-medium">
                {extreme.type === "high" ? m.page_tide_high() : m.page_tide_low()}
              </span>
              <span className="text-s text-neutral-7">
                {formatDay(extreme.time, zone)} {formatClock(extreme.time, zone)}
              </span>
              <span className="min-w-[4.5rem] text-right">
                {formatHeight(extreme.heightMeters)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-7">{m.page_no_tide()}</p>
      )}
    </SpotSection>
  );
}
