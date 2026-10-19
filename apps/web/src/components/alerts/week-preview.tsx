import type { TideSegment } from "@repo/config/sea-words";
import { ChevronDownIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { createContext, useContext, useMemo, useState } from "react";

import { formatClock, formatDay, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import type { AlertPreview } from "../viewer/types";
import { SEGMENT_WORDS } from "./alert-words";

const HOUR_MS = 60 * 60 * 1000;
const DAYS = 7;

type Hour = AlertPreview["spots"][number]["hours"][number];
/** A window an account would be told of, at one of the alert's places. */
export type WeekPiece = { start: Date; end: Date; spotId: string; hours: Hour[] };

/** The week as the editor judges it, for what changes a part to say as it moves. */
export type WeekOf = { count: number | null; days: boolean[] };
export const Week = createContext<WeekOf>({ count: null, days: [] });

/** What an alert asks, so that a window says those figures and no other. */
export type Asked = {
  waves: boolean;
  period: boolean;
  swell: boolean;
  wind: boolean;
  tide: boolean;
  coefficient: boolean;
};

export type WeekState = "nothing" | "failed" | "noSea" | "pending" | "ready";

/** The hour of a moment in a zone, from 0 to 24, with its minutes as a fraction. */
function hourIn(time: Date, zone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(time);
  const of = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return of("hour") + of("minute") / 60;
}

/** How many windows, in words. */
export function countWords(count: number) {
  if (count === 0) return m.alert_week_none();
  return count === 1 ? m.alert_week_one() : m.alert_week_many({ count });
}

/** The seven days from today, each with the windows that start on it. */
export function weekDays(pieces: WeekPiece[], now: number, zone: string | undefined) {
  const days: { key: string; pieces: WeekPiece[] }[] = [];
  for (let at = 0; at < DAYS; at++) {
    days.push({ key: formatDay(new Date(now + at * 24 * HOUR_MS), zone), pieces: [] });
  }
  for (const piece of pieces) {
    days.find((day) => day.key === formatDay(piece.start, zone))?.pieces.push(piece);
  }
  return days;
}

/** A row of seven dots, filled for a day that has a window. */
export function DayDots({ days }: { days: boolean[] }) {
  return (
    <span aria-hidden className="inline-flex gap-[3px]">
      {days.map((on, at) => (
        <span
          // The days are in order, and nothing else tells them apart.
          // oxlint-disable-next-line react/no-array-index-key
          key={at}
          className={cn("size-2 rounded-full", on ? "bg-neutral-10" : "bg-neutral-4")}
        />
      ))}
    </span>
  );
}

/**
 * The count of windows, in what changes a part, with what the moves made there won or lost:
 * `since` is the count as the part opened.
 */
export function LiveCount({ since }: { since: number | null }) {
  const week = useContext(Week);
  if (week.count === null) return null;
  const delta = since === null ? 0 : week.count - since;
  return (
    <div
      className="flex items-center gap-xs rounded-(--radius-s) bg-neutral-2 px-s py-xs text-s"
      aria-live="polite"
    >
      <DayDots days={week.days} />
      <span>
        <span className="font-medium tabular-nums">{countWords(week.count)}</span>
        {delta !== 0 && (
          <span
            className={cn(
              "ms-xxs font-medium tabular-nums",
              delta > 0 ? "text-neutral-10" : "text-neutral-8",
            )}
          >
            {delta > 0 ? `+${delta}` : `−${-delta}`}
          </span>
        )}
      </span>
    </div>
  );
}

const spread = (values: number[], say: (value: number) => string) => {
  if (values.length === 0) return undefined;
  const least = Math.min(...values);
  const most = Math.max(...values);
  return least === most ? say(least) : `${say(least)} → ${say(most)}`;
};

/** What a window was, in the figures the alert asks and no other. */
function pieceFigures(piece: WeekPiece, asked: Asked) {
  const inside = piece.hours.filter((hour) => hour.time >= piece.start && hour.time < piece.end);
  const of = (read: (hour: Hour) => number | null | undefined) =>
    inside.flatMap((hour) => read(hour) ?? []);
  const segments = [
    ...new Set(
      inside.flatMap((hour): TideSegment[] => (hour.tideSegment ? [hour.tideSegment] : [])),
    ),
  ];
  const coefficient = inside.find((hour) => hour.tideCoefficient !== null)?.tideCoefficient;
  return [
    asked.waves &&
      spread(
        of((hour) => hour.waveHeightMeters),
        formatHeight,
      ),
    asked.period &&
      spread(
        of((hour) => hour.wavePeakPeriodSeconds),
        formatSeconds,
      ),
    asked.swell &&
      spread(
        of((hour) => hour.primarySwellHeightMeters),
        (height) => m.alert_preview_swell({ height: formatHeight(height) }),
      ),
    asked.wind &&
      spread(
        of((hour) => hour.windSpeedMetersPerSecond),
        (speed) => formatWind(toKnots(speed)),
      ),
    asked.tide &&
      segments.length > 0 &&
      (segments.length === 1
        ? SEGMENT_WORDS[segments[0]!]()
        : `${SEGMENT_WORDS[segments[0]!]()} → ${SEGMENT_WORDS[segments.at(-1)!]()}`),
    asked.coefficient &&
      coefficient != null &&
      m.alert_week_coefficient({ value: formatNumber(coefficient, 0) }),
  ].filter((figure): figure is string => typeof figure === "string" && figure !== "");
}

/**
 * What an alert would tell over the week ahead: a line under its sentence, with a dot for each
 * day, which opens on the seven days, each a line of its hours, and a day on its windows, said
 * in the figures the alert asks. Decision 031, "The editor".
 */
export function WeekPreview({
  state,
  pieces,
  asked,
  now,
  zone,
  nameOf,
  notes,
}: {
  state: WeekState;
  pieces: WeekPiece[];
  asked: Asked;
  now: number;
  zone: string | undefined;
  // The name of a place, for an alert on several: undefined for one on one place.
  nameOf?: (spotId: string) => string;
  // What else there is to say: an older forecast, a place with no tide.
  notes: string[];
}) {
  const [isOpen, setOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const days = useMemo(() => weekDays(pieces, now, zone), [pieces, now, zone]);

  if (state !== "ready") {
    const words = {
      nothing: m.alert_preview_no_condition(),
      failed: m.alert_preview_failed(),
      pending: m.alert_preview_pending(),
      noSea: m.alert_preview_no_sea(),
    }[state];
    return (
      <p className="text-s text-pretty text-neutral-7" aria-live="polite">
        {words}
      </p>
    );
  }

  const ringing = days.filter((one) => one.pieces.length > 0).length;
  const nowHour = hourIn(new Date(now), zone);
  return (
    <div className="grid gap-xs">
      <div className="grid rounded-(--radius-s) border border-neutral-4" aria-live="polite">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpen((open) => !open)}
          className="focus-ring flex items-center justify-between gap-s rounded-(--radius-s) p-s text-start outline-none"
        >
          <span className="grid">
            <span className="font-medium">{countWords(pieces.length)}</span>
            {pieces.length > 0 && (
              <span className="text-xs text-neutral-7">
                {ringing === 1 ? m.alert_week_days_one() : m.alert_week_days({ count: ringing })}
              </span>
            )}
          </span>
          <span className="flex items-center gap-s">
            <DayDots days={days.map((one) => one.pieces.length > 0)} />
            <ChevronDownIcon
              aria-hidden
              className={cn("size-4 text-neutral-7 transition-transform", isOpen && "rotate-180")}
            />
          </span>
        </button>

        {isOpen && (
          <div className="grid gap-xs px-s pb-s">
            <div className="grid grid-cols-[2.75rem_1fr_2.5rem] gap-xs text-xxs text-neutral-7">
              <span />
              <span className="relative h-3">
                {[6, 12, 18].map((hour) => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2 tabular-nums"
                    style={{ left: `${(hour / 24) * 100}%` }}
                  >
                    {hour}
                  </span>
                ))}
              </span>
              <span />
            </div>
            {days.map((one, at) => {
              const total = one.pieces.reduce(
                (sum, piece) => sum + (piece.end.getTime() - piece.start.getTime()) / HOUR_MS,
                0,
              );
              const isDay = day === one.key;
              return (
                <div key={one.key} className="grid gap-xxs">
                  <button
                    type="button"
                    disabled={one.pieces.length === 0}
                    aria-expanded={one.pieces.length > 0 ? isDay : undefined}
                    onClick={() => setDay(isDay ? null : one.key)}
                    className="focus-ring grid grid-cols-[2.75rem_1fr_2.5rem] items-center gap-xs rounded-(--radius-xs) text-start text-s outline-none disabled:cursor-default"
                  >
                    <span className={cn(one.pieces.length === 0 && "text-neutral-7")}>
                      {one.key}
                    </span>
                    <span className="relative h-3.5 rounded-full bg-neutral-3">
                      {one.pieces.map((piece) => {
                        const from = hourIn(piece.start, zone);
                        const to =
                          formatDay(piece.end, zone) === one.key ? hourIn(piece.end, zone) : 24;
                        return (
                          <span
                            key={`${piece.spotId}-${piece.start.getTime()}`}
                            className="absolute inset-y-0 rounded-full bg-neutral-10"
                            style={{
                              left: `${(from / 24) * 100}%`,
                              right: `${100 - (to / 24) * 100}%`,
                            }}
                          />
                        );
                      })}
                      {at === 0 && (
                        <span
                          aria-hidden
                          className="absolute -inset-y-1 w-0.5 rounded-full bg-neutral-7"
                          style={{ left: `${(nowHour / 24) * 100}%` }}
                        />
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-end tabular-nums",
                        total > 0 ? "font-medium" : "text-neutral-7",
                      )}
                    >
                      {total > 0 ? m.alert_hours({ count: Math.round(total) }) : "—"}
                    </span>
                  </button>
                  {isDay && (
                    <ul className="ms-[3.25rem] grid gap-xxs rounded-(--radius-s) bg-neutral-2 px-s py-xs text-xs">
                      {one.pieces.map((piece) => (
                        <li key={`${piece.spotId}-${piece.start.getTime()}`}>
                          {nameOf && <span>{nameOf(piece.spotId)} · </span>}
                          <span className="font-medium tabular-nums">
                            {formatClock(piece.start, zone)} – {formatClock(piece.end, zone)}
                          </span>
                          {pieceFigures(piece, asked).map((figure) => (
                            <span key={figure} className="text-neutral-8">
                              {" · "}
                              {figure}
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <p className="text-xxs text-pretty text-neutral-7">{m.alert_week_hint()}</p>
          </div>
        )}
      </div>
      {notes.map((note) => (
        <p key={note} className="text-xs text-pretty text-neutral-7">
          {note}
        </p>
      ))}
    </div>
  );
}
