import { ChevronRightIcon } from "@repo/ui/icon";

import { formatClock, formatDate, formatDuration } from "@/lib/format";

import type { Session } from "../viewer/types";
import { RatingStars } from "./rating";
import { SessionSea } from "./session-sea";

/** When a session was and how long it lasted, as "Sat 10 Oct · 09:00 · 1 h 30". */
export function sessionWhen(session: Pick<Session, "startedAt" | "durationMinutes">, now: number) {
  return [
    formatDate(session.startedAt, now),
    formatClock(session.startedAt),
    formatDuration(session.durationMinutes),
  ].join(" · ");
}

/**
 * A session on a line of a list: where or when it was, its rating, and what the sea did. A
 * press opens it. A list of one place leaves the place out.
 */
export function SessionRow({
  session,
  now,
  withPlace = false,
  onOpen,
}: {
  session: Session;
  now: number;
  withPlace?: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="focus-ring flex min-h-14 w-full cursor-pointer items-center gap-xs rounded-(--radius-xs) px-xs py-xs text-left outline-none hover:bg-neutral-3-transparent"
        onClick={onOpen}
      >
        <span className="grid min-w-0 flex-1 gap-xxs">
          <span className="flex items-center gap-xs">
            <span className="min-w-0 truncate">
              {withPlace ? session.place.name : sessionWhen(session, now)}
            </span>
            <RatingStars rating={session.rating} />
          </span>
          {withPlace && (
            <span className="truncate text-s text-neutral-7">{sessionWhen(session, now)}</span>
          )}
          <SessionSea session={session} />
        </span>
        <ChevronRightIcon data-slot="icon" aria-hidden className="shrink-0 text-neutral-7" />
      </button>
    </li>
  );
}
