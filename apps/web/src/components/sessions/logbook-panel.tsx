import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { PlusIcon, RatingFillIcon } from "@repo/ui/icon";
import { useMemo } from "react";

import { formatDuration, formatMonth, formatNumber } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import type { Loadable, Session, SessionRecap } from "../viewer/types";
import { SessionRow } from "./session-row";

type LogbookPanelProps = {
  now: number;
  log: Loadable<Session[]>;
  recap: Loadable<SessionRecap>;
  onAdd: () => void;
  onOpen: (session: Session) => void;
  // Opens a place of the log on the map.
  onOpenPlace: (place: { breakId: string } | { spotId: string }) => void;
};

/** A figure of the recap: what it counts, and how much. */
function Count({ name, count, minutes }: { name: string; count: number; minutes: number }) {
  return (
    <div className="edge grid gap-xxs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
      <span className="text-s text-neutral-7">{name}</span>
      <span className="text-l font-medium tabular-nums">
        {count === 1 ? m.sessions_count_one() : m.sessions_count({ count })}
      </span>
      <span className="text-s text-neutral-7 tabular-nums">
        {m.sessions_in_water({ duration: formatDuration(minutes) })}
      </span>
    </div>
  );
}

/**
 * An account's log of its sessions: what it comes to this month and this year, the places it
 * surfs most with how it rated them, and every session, month by month. One step into the
 * account's panel. Decision 043.
 */
export function LogbookPanel({ now, log, recap, onAdd, onOpen, onOpenPlace }: LogbookPanelProps) {
  // The sessions month by month, the latest month first, as the list gives them.
  const months = useMemo(() => {
    const byMonth: { name: string; sessions: Session[] }[] = [];
    for (const session of log.data ?? []) {
      const name = formatMonth(session.startedAt);
      const last = byMonth.at(-1);
      if (last?.name === name) last.sessions.push(session);
      else byMonth.push({ name, sessions: [session] });
    }
    return byMonth;
  }, [log.data]);

  if (log.isError) return <p className="text-s text-neutral-7">{m.sessions_load_failed()}</p>;
  if (!log.data) {
    return (
      <div className="grid gap-m">
        <div className="grid grid-cols-2 gap-xs">
          <Skeleton className="h-24 rounded-(--radius-s)" />
          <Skeleton className="h-24 rounded-(--radius-s)" />
        </div>
        <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-m) w-4/5 rounded-(--radius-xs)" />
      </div>
    );
  }

  const add = (
    <Button variant="secondary" onClick={onAdd}>
      <PlusIcon data-slot="icon" aria-hidden />
      {m.session_add()}
    </Button>
  );
  if (log.data.length === 0) {
    return (
      <div className="grid justify-items-start gap-m">
        <p className="text-neutral-7">{m.sessions_empty()}</p>
        {add}
      </div>
    );
  }

  const places = recap.data?.places ?? [];
  return (
    <div className="grid gap-l">
      {recap.data && (
        <div className="grid grid-cols-2 gap-xs">
          <Count name={m.sessions_this_month()} {...recap.data.month} />
          <Count name={m.sessions_this_year()} {...recap.data.year} />
        </div>
      )}

      {places.length > 0 && (
        <section className="grid gap-xs">
          <h2 className="text-s font-medium text-neutral-7">{m.sessions_places()}</h2>
          <ul className="-mx-xs grid gap-xxs">
            {places.map((place) => {
              const { spotId, breakId } = place;
              const figures = (
                <>
                  <span className="min-w-0 flex-1 truncate">{place.name}</span>
                  <span className="flex shrink-0 items-center gap-xs text-s text-neutral-7 tabular-nums">
                    {place.averageRating !== null && (
                      <span className="inline-flex items-center gap-xxs">
                        <RatingFillIcon aria-hidden className="size-3.5 text-neutral-10" />
                        {formatNumber(place.averageRating)}
                      </span>
                    )}
                    {place.count === 1
                      ? m.sessions_count_one()
                      : m.sessions_count({ count: place.count })}
                  </span>
                </>
              );
              const layout = "flex min-h-11 w-full items-center gap-xs rounded-(--radius-xs) px-xs";
              return (
                <li key={spotId ?? breakId ?? place.name}>
                  {spotId || breakId ? (
                    <button
                      type="button"
                      className={`${layout} focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
                      onClick={() => onOpenPlace(spotId ? { spotId } : { breakId: breakId ?? "" })}
                    >
                      {figures}
                    </button>
                  ) : (
                    // A place that is gone has its sessions, and nothing to open.
                    <div className={layout}>{figures}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div>{add}</div>

      {months.map((month) => (
        <section key={month.name} className="grid gap-xs">
          <h2 className="text-s font-medium text-neutral-7 first-letter:uppercase">{month.name}</h2>
          <ul className="-mx-xs grid gap-xxs">
            {month.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                now={now}
                withPlace
                onOpen={() => onOpen(session)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
