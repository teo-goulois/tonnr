import { likedConditions, LIKED_FROM, LIKED_SESSIONS } from "@repo/conditions/sessions/liked";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { PlusIcon } from "@repo/ui/icon";
import { useMemo } from "react";

import { m } from "@/paraglide/messages.js";

import { ConditionsSummary } from "../alerts/alert-summary";
import { AccountPrompt } from "../viewer/saved-panel";
import type { AlertCriteria, Loadable, MediaItem, Session } from "../viewer/types";
import { SessionRow } from "./session-row";

type PlaceSessionsProps = {
  now: number;
  // The photos and videos of the sessions, by session. Decision 066.
  media?: Readonly<Record<string, MediaItem[]>>;
  signedIn: boolean;
  // The sessions the account surfed at the place, the latest first.
  sessions: Loadable<Session[]>;
  onAdd: () => void;
  onOpen: (session: Session) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  // Begins an alert with what the account likes there. Given at a spot of its own alone: an
  // alert is set on a spot.
  onAlert?: (criteria: AlertCriteria) => void;
};

/**
 * The sessions an account surfed at a place, and what it likes there: the conditions its best
 * sessions had in common, said as an alert says its own. Decision 043.
 */
export function PlaceSessions({
  now,
  media,
  signedIn,
  sessions,
  onAdd,
  onOpen,
  onSignIn,
  onCreateAccount,
  onAlert,
}: PlaceSessionsProps) {
  const liked = useMemo(() => likedConditions(sessions.data ?? []), [sessions.data]);

  if (!signedIn) {
    return (
      <AccountPrompt
        text={m.session_sign_in_prompt()}
        onSignIn={onSignIn}
        onCreateAccount={onCreateAccount}
      />
    );
  }
  if (sessions.isError) return <p className="text-s text-neutral-7">{m.sessions_load_failed()}</p>;
  if (!sessions.data) {
    return (
      <div className="grid gap-s">
        <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
        <Skeleton className="h-(--line-m) w-4/5 rounded-(--radius-xs)" />
      </div>
    );
  }

  const missing = LIKED_SESSIONS - liked.liked;
  return (
    <div className="grid gap-m">
      {sessions.data.length === 0 ? (
        <p className="text-neutral-7">{m.sessions_here_empty()}</p>
      ) : (
        <section className="edge grid gap-xs rounded-(--radius-s) p-s [--edge-color:var(--neutral-4)]">
          <h3 className="font-medium">{m.sessions_liked_title()}</h3>
          {liked.criteria ? (
            <>
              <p className="text-s text-pretty">
                <ConditionsSummary criteria={liked.criteria} />
              </p>
              <p className="text-xs text-neutral-7">
                {m.sessions_liked_from({ count: liked.liked, rating: LIKED_FROM })}
              </p>
              {onAlert && (
                <div className="mt-xxs">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => liked.criteria && onAlert(liked.criteria)}
                  >
                    {m.sessions_liked_alert()}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-s text-neutral-7">
              {missing > 0
                ? missing === 1
                  ? m.sessions_liked_missing_one({ rating: LIKED_FROM })
                  : m.sessions_liked_missing({ count: missing, rating: LIKED_FROM })
                : m.sessions_liked_unread()}
            </p>
          )}
        </section>
      )}

      <div>
        <Button variant="secondary" onClick={onAdd}>
          <PlusIcon data-slot="icon" aria-hidden />
          {m.session_add()}
        </Button>
      </div>

      {sessions.data.length > 0 && (
        <ul className="-mx-xs grid gap-xxs">
          {sessions.data.map((session) => (
            <SessionRow
              key={session.id}
              media={media?.[session.id]}
              session={session}
              now={now}
              onOpen={() => onOpen(session)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
