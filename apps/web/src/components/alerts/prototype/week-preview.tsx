// PROTOTYPE, throwaway (branch prototype/alert-conditions). What the alert would have told over
// the week ahead: a line under the sentence, which opens on a timeline of the seven days, and the
// same count, with what it just won or lost, in what changes a part (`LiveCount`).

import { ChevronDownIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { createContext, useContext, useMemo, useState } from "react";

import { formatDay, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { formatHeight, formatWind } from "@/lib/units";

import { CYCLE_WORDS, type JudgedHour, type Piece } from "./rules";

const HOUR_MS = 60 * 60 * 1000;
const DAYS = 7;

/** The week as the editor judges it, for what changes a part to say as it moves. */
export type WeekOf = { count: number | null; days: boolean[] };
export const Week = createContext<WeekOf>({ count: null, days: [] });

/** What an alert asks, so that a window says those figures and no other. */
export type Asked = {
  waves: boolean;
  period: boolean;
  wind: boolean;
  tide: boolean;
  coef: boolean;
};

export type WeekState = "nothing" | "failed" | "pending" | "noSea" | "ready";

/** The hour of a time in a zone, from 0 to 24, with its minutes as a fraction. */
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

const clock = (hour: number) => `${Math.round(hour) % 24} h`;

export const countWords = (count: number) =>
  count === 0 ? "Aucun créneau" : count === 1 ? "1 créneau" : `${count} créneaux`;

/** The seven days from today, each with the pieces that start on it. */
export function weekDays(pieces: Piece[], now: number, zone: string | undefined) {
  const days: { key: string; label: string; start: Date; pieces: Piece[] }[] = [];
  for (let at = 0; at < DAYS; at++) {
    const start = new Date(now + at * 24 * HOUR_MS);
    days.push({ key: formatDay(start, zone), label: formatDay(start, zone), start, pieces: [] });
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
          key={at}
          className={cn("size-2 rounded-full", on ? "bg-neutral-10" : "bg-neutral-4")}
        />
      ))}
    </span>
  );
}

/** The count of windows in what changes a part, with what the last moves won or lost. */
export function LiveCount({ since }: { since: number | null }) {
  const week = useContext(Week);
  if (week.count === null) return null;
  const delta = since === null ? 0 : week.count - since;
  return (
    <div className="flex items-center gap-xs rounded-(--radius-s) bg-neutral-2 px-s py-xs text-s">
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
        )}{" "}
        cette semaine
      </span>
    </div>
  );
}

const range = (values: number[], say: (value: number) => string) => {
  if (values.length === 0) return undefined;
  const least = Math.min(...values);
  const most = Math.max(...values);
  return least === most ? say(least) : `${say(least)} → ${say(most)}`;
};

/** What a window was, in the figures the alert asks and no other. */
function pieceFigures(piece: Piece, hours: JudgedHour[], asked: Asked) {
  const inside = hours.filter((hour) => hour.time >= piece.start && hour.time < piece.end);
  const of = (read: (hour: JudgedHour) => number | null) =>
    inside.flatMap((hour) => read(hour) ?? []);
  const segments = [
    ...new Set(inside.flatMap((hour) => (hour.tide.segment ? [hour.tide.segment] : []))),
  ];
  return [
    asked.waves &&
      range(
        of((hour) => hour.waveHeightMeters),
        formatHeight,
      ),
    asked.period &&
      range(
        of((hour) => hour.wavePeakPeriodSeconds),
        formatSeconds,
      ),
    asked.wind &&
      range(
        of((hour) => hour.windSpeedMetersPerSecond),
        (speed) => formatWind(toKnots(speed)),
      ),
    asked.tide &&
      segments.length > 0 &&
      (segments.length === 1
        ? CYCLE_WORDS[segments[0]!]
        : `${CYCLE_WORDS[segments[0]!]} → ${CYCLE_WORDS[segments.at(-1)!]}`),
    asked.coef &&
      piece.first.tide.coefficient !== null &&
      `coef ${formatNumber(piece.first.tide.coefficient, 0)}`,
  ].filter(Boolean) as string[];
}

/** The line under the sentence, and the week's timeline it opens. */
export function WeekPreview({
  state,
  pieces,
  hours,
  asked,
  now,
  zone,
  noTide,
}: {
  state: WeekState;
  pieces: Piece[];
  hours: JudgedHour[];
  asked: Asked;
  now: number;
  zone: string | undefined;
  noTide?: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const days = useMemo(() => weekDays(pieces, now, zone), [pieces, now, zone]);

  if (state !== "ready") {
    const words = {
      nothing: "Choisis au moins une condition pour voir quand ça sonnerait.",
      failed: "L'aperçu n'a pas pu être calculé.",
      pending: "Calcul de la semaine…",
      noSea: "Pas de prévision de mer ici pour l'instant.",
    }[state];
    return <p className="text-s text-neutral-7">{words}</p>;
  }

  const ringing = days.filter((one) => one.pieces.length > 0).length;
  const nowHour = hourIn(new Date(now), zone);
  return (
    <div className="grid rounded-(--radius-s) border border-neutral-4" aria-live="polite">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((open) => !open)}
        className="focus-ring flex items-center justify-between gap-s rounded-(--radius-s) px-s py-s text-start outline-none"
      >
        <span className="grid gap-0">
          <span className="font-medium">{countWords(pieces.length)} cette semaine</span>
          {pieces.length > 0 && (
            <span className="text-xs text-neutral-7">
              {ringing === 1 ? "1 jour sur 7" : `${ringing} jours sur 7`}
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
                  className="absolute -translate-x-1/2"
                  style={{ left: `${(hour / 24) * 100}%` }}
                >
                  {hour} h
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
                  aria-expanded={isDay}
                  onClick={() => setDay(isDay ? null : one.key)}
                  className="focus-ring grid grid-cols-[2.75rem_1fr_2.5rem] items-center gap-xs rounded-(--radius-xs) text-start text-s outline-none disabled:cursor-default"
                >
                  <span className={cn(one.pieces.length === 0 && "text-neutral-7")}>
                    {one.label}
                  </span>
                  <span className="relative h-3.5 rounded-full bg-neutral-3">
                    {one.pieces.map((piece) => {
                      const from = hourIn(piece.start, zone);
                      const to =
                        formatDay(piece.end, zone) === one.key ? hourIn(piece.end, zone) : 24;
                      return (
                        <span
                          key={piece.start.getTime()}
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
                    {total > 0 ? `${Math.round(total)} h` : "—"}
                  </span>
                </button>
                {isDay && (
                  <ul className="ms-[3.25rem] grid gap-xxs rounded-(--radius-s) bg-neutral-2 px-s py-xs text-xs">
                    {one.pieces.map((piece) => (
                      <li key={piece.start.getTime()}>
                        <span className="font-medium tabular-nums">
                          {clock(hourIn(piece.start, zone))} – {clock(hourIn(piece.end, zone))}
                        </span>
                        {pieceFigures(piece, hours, asked).map((figure) => (
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
          <p className="text-xxs text-neutral-7">
            En noir, les heures où l'alerte sonnerait, dans les heures de ton compte. Touche un jour
            pour le détail.
          </p>
          {noTide && <p className="text-xs text-neutral-7">{noTide}</p>}
        </div>
      )}
    </div>
  );
}
