import { Bearing } from "@/components/viewer/bearing";
import { formatAgo, formatDay, formatSeconds, toKnots } from "@/lib/format";
import type { SpotWeek } from "@/lib/pages-api";
import {
  type ScaleStop,
  WAVE_HEIGHT_SCALE,
  WIND_SPEED_SCALE,
  scaleColor,
  scaleInk,
} from "@/lib/sea-scales";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { SpotSection } from "./spot-frame";

// The week at a surf break, one line a day: the biggest wave with its period and its direction,
// and the wind at noon, in the colors of the map. It comes from the forecast the worker keeps for
// the break's cell, and says when it was fetched. Decision 057.

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

// A day's label from its `YYYY-MM-DD`: read at noon UTC, so that the day is the one written.
function dayLabel(day: string) {
  return formatDay(new Date(`${day}T12:00:00Z`), "UTC");
}

/**
 * The seven days as a table: the day, the biggest wave, the wind at noon. With no forecast kept,
 * a sentence says that the forecast is on the map.
 */
export function WeekTable({ week, now }: { week: SpotWeek | null; now: number }) {
  useUnits();
  if (!week) {
    return (
      <SpotSection title={m.page_week()}>
        <p className="text-neutral-7">{m.page_week_none()}</p>
      </SpotSection>
    );
  }
  return (
    <SpotSection title={m.page_week()}>
      <table className="w-full text-s">
        <thead className="text-left text-neutral-7">
          <tr>
            <th scope="col" className="pb-xs font-normal">
              {m.details_week()}
            </th>
            <th scope="col" className="pb-xs font-normal">
              {m.page_week_wave()}
            </th>
            <th scope="col" className="pb-xs font-normal">
              {m.page_week_wind()}
            </th>
          </tr>
        </thead>
        <tbody>
          {week.days.map((day) => {
            const wind = day.wind && toKnots(day.wind.speedMetersPerSecond);
            return (
              <tr key={day.day} className="shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]">
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
                        <span className="tabular-nums">
                          {formatSeconds(day.wave.peakPeriodSeconds)}
                        </span>
                      )}
                      {day.wave.directionDegrees !== null && (
                        <Bearing degrees={day.wave.directionDegrees} />
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
                      {day.wind.directionDegrees !== null && (
                        <Bearing degrees={day.wind.directionDegrees} />
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
      <p className="text-s text-neutral-7">
        {m.page_week_fetched({ ago: formatAgo(week.fetchedAt, now) })}
        {week.stale && ` ${m.page_week_stale()}`}
      </p>
    </SpotSection>
  );
}
