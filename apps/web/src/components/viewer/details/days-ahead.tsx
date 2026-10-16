import { weekOf } from "@repo/conditions/forecasts/week";
import { shoreWind } from "@repo/conditions/shore-wind";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMemo } from "react";

import { formatDay, formatSeconds, toKnots } from "@/lib/format";
import {
  type ScaleStop,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
  scaleInk,
} from "@/lib/sea-scales";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../bearing";
import type { Forecast } from "../types";
import { SHORE_WIND_NAMES } from "./parts";

// The days ahead in words, for the essentials of a panel: one line a day, the biggest wave on
// the color of its height and the wind at noon named by how it meets the shore, as the page of a
// break writes its week. Decision 061.

/** A figure on the color its scale gives it, as the map colors the sea and the wind. */
function SeaChip({
  scale,
  value,
  children,
}: {
  scale: ScaleStop[];
  value: number;
  children: string;
}) {
  return (
    <span
      className="inline-flex h-6 items-center rounded-(--radius-xs) px-xs text-s font-medium tabular-nums whitespace-nowrap"
      style={{ background: scaleColor(scale, value), color: scaleInk(scale, value) }}
    >
      {children}
    </span>
  );
}

// A day's label from its `YYYY-MM-DD` in the reader's zone: read at noon, so that the day is
// the one written.
function dayLabel(day: string) {
  return formatDay(new Date(`${day}T12:00:00`));
}

/**
 * The days as a table: the day, the biggest wave, the wind at noon. The days are the reader's
 * own, as the hours of the week's table are.
 */
export function DaysAhead({
  hours,
  now,
  offshoreFrom,
  isLoading,
}: {
  hours: Forecast["hours"] | undefined;
  now: number;
  // Where the wind comes from when it blows off the shore there, when that is known.
  offshoreFrom?: number | null;
  isLoading: boolean;
}) {
  useUnits();
  const days = useMemo(
    () =>
      hours ? weekOf(hours, Intl.DateTimeFormat().resolvedOptions().timeZone, new Date(now)) : [],
    // The days move with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hours, Math.floor(now / (60 * 60 * 1000))],
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-(--radius-xs)" />;
  if (days.length === 0) return null;

  return (
    <table className="w-full text-s">
      <thead className="text-left text-xs text-neutral-7">
        <tr>
          <th scope="col" className="pb-xxs font-normal" />
          <th scope="col" className="pb-xxs font-normal">
            {m.details_waves()}
          </th>
          <th scope="col" className="pb-xxs font-normal">
            {m.details_wind()}
          </th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => {
          const wind = day.wind && toKnots(day.wind.speedMetersPerSecond);
          const atShore =
            day.wind?.directionDegrees != null && offshoreFrom != null
              ? shoreWind(day.wind.directionDegrees, offshoreFrom)
              : null;
          return (
            <tr key={day.day} className="shadow-[inset_0_var(--border-s)_0_var(--neutral-3)]">
              <th scope="row" className="py-xs pr-s text-left font-medium whitespace-nowrap">
                {dayLabel(day.day)}
              </th>
              <td className="py-xs pr-s">
                {day.wave ? (
                  <span className="flex flex-wrap items-center gap-xs">
                    <SeaChip scale={WAVE_HEIGHT_SCALE} value={day.wave.heightMeters}>
                      {formatHeight(day.wave.heightMeters)}
                    </SeaChip>
                    {day.wave.peakPeriodSeconds !== null && (
                      <span className="text-neutral-7 tabular-nums">
                        {formatSeconds(day.wave.peakPeriodSeconds)}
                      </span>
                    )}
                    {day.wave.directionDegrees !== null && (
                      <Bearing degrees={day.wave.directionDegrees} className="text-neutral-7" />
                    )}
                  </span>
                ) : (
                  <span className="text-neutral-7">–</span>
                )}
              </td>
              <td className="py-xs">
                {day.wind && wind !== null ? (
                  <span className="flex flex-wrap items-center gap-xs">
                    <SeaChip scale={WIND_SPEED_SCALE} value={wind}>
                      {formatWind(wind)}
                    </SeaChip>
                    {/* Named by the shore where the place knows it, by its point otherwise. */}
                    {atShore ? (
                      <Badge>{SHORE_WIND_NAMES[atShore]()}</Badge>
                    ) : (
                      day.wind.directionDegrees !== null && (
                        <Bearing degrees={day.wind.directionDegrees} className="text-neutral-7" />
                      )
                    )}
                  </span>
                ) : (
                  <span className="text-neutral-7">–</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
