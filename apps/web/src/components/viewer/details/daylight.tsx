import { daylightOf } from "@repo/client/viewer/daylight";
import { cn } from "@repo/ui/lib/utils";
import { useMemo } from "react";

import { formatClock } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { Block } from "./parts";

/**
 * When it gets light and dark at the place: first light, sunrise, sunset and last light, the
 * morning's two over the evening's, in tiles as the values now are. Today's, or tomorrow's once
 * today's last light is gone. A moment already gone is pale, as the tide's hours are.
 */
export function Daylight({
  now,
  place,
}: {
  now: number;
  place: { latitude: number; longitude: number };
}) {
  const { latitude, longitude } = place;
  const daylight = useMemo(
    () => daylightOf(now, { latitude, longitude }),
    [now, latitude, longitude],
  );
  const moments = [
    { label: m.daylight_first_light(), at: daylight.firstLight },
    { label: m.daylight_sunrise(), at: daylight.sunrise },
    { label: m.daylight_sunset(), at: daylight.sunset },
    { label: m.daylight_last_light(), at: daylight.lastLight },
  ];
  return (
    <Block
      title={m.daylight_title()}
      control={
        <span className="text-s text-neutral-7">
          {daylight.day === "today" ? m.daylight_today() : m.daylight_tomorrow()}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-xs">
        {moments.map(({ label, at }) => (
          <div
            key={label}
            className="grid content-start gap-xxs rounded-(--radius-xs) bg-neutral-2 px-xs py-xs"
          >
            <dt className="truncate text-xs text-neutral-7">{label}</dt>
            <dd
              className={cn(
                "truncate text-l font-medium tabular-nums",
                at && at.getTime() <= now && "text-neutral-7",
              )}
            >
              {/* The sun does not cross that height that day, near the poles. */}
              {at ? formatClock(at) : "–"}
            </dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}
