import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useState } from "react";

import type { Recent } from "@/lib/recents";
import { m } from "@/paraglide/messages.js";

import {
  type Found,
  PlaceSearch,
  type PlaceSearching,
  SEARCH_BODY,
  SEARCH_HEAD,
} from "../viewer/place-search";
import { AccountPrompt, BreakRow, SpotRow } from "../viewer/saved-panel";
import type { Spot } from "../viewer/types";
import { ViewerDrawer } from "../viewer/viewer-drawer";
import { SessionForm } from "./session-form";
import { sessionWhen } from "./session-row";
import { SessionConditions, SessionCredits } from "./session-sea";
import type { SessionPlace, Sessioning } from "./types";

type SessionSheetProps = {
  wide: boolean;
  now: number;
  signedIn: boolean;
  sessioning: Sessioning;
  // The search that finds where a session was: the account's spots and the breaks.
  search: PlaceSearching;
  // What is offered before a name is typed: the account's spots, and the breaks looked at last.
  spots: Spot[] | undefined;
  recents: Recent[];
  onSignIn: () => void;
  onCreateAccount: () => void;
  // Opens the place of a session on the map.
  onOpenPlace: (place: { breakId: string } | { spotId: string }) => void;
};

/**
 * The sheet a session is written in: a new one asks where, unless it was begun at a place, then
 * when, how long and how it was. A session of the log opens in it too, with what the sea did,
 * to be changed or deleted. Decision 043.
 */
export function SessionSheet({
  wide,
  now,
  signedIn,
  sessioning,
  search,
  spots,
  recents,
  onSignIn,
  onCreateAccount,
  onOpenPlace,
}: SessionSheetProps) {
  const { open, detail } = sessioning;
  // The place a new session was said to be at, in the sheet itself.
  const [picked, setPicked] = useState<SessionPlace | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  if (!open && (picked || isDeleting)) {
    setPicked(null);
    setIsDeleting(false);
  }

  const isNew = open !== null && open.sessionId === undefined;
  const place = open?.place ?? picked ?? undefined;
  const session = open?.sessionId !== undefined ? detail.data : undefined;
  const looked = recents.filter((recent) => recent.kind === "break");
  const pick = (found: Found) => {
    if (!found.id || (found.kind !== "spot" && found.kind !== "break")) return;
    setPicked({ kind: found.kind, id: found.id, name: found.name });
  };

  return (
    <ViewerDrawer
      open={open !== null}
      onOpenChange={(next) => {
        if (!next) sessioning.onClose();
      }}
      wide={wide}
      title={
        isNew
          ? m.session_new()
          : (session?.place.name ?? (
              <Skeleton className="h-(--line-l) w-40 rounded-(--radius-xs)" />
            ))
      }
      description={
        isNew
          ? (place?.name ?? (signedIn ? m.session_where() : undefined))
          : session && sessionWhen(session, now)
      }
      // The place may be chosen again, whether it was chosen in the sheet or the session was begun
      // at it.
      onBack={
        isNew && place
          ? () => {
              setPicked(null);
              if (open?.place) sessioning.onBegin();
            }
          : undefined
      }
      // While it asks where, the sheet is as tall as a sheet goes: what the search finds comes
      // and goes without moving it.
      fill={signedIn && isNew && !place}
    >
      {!signedIn ? (
        <AccountPrompt
          text={m.session_sign_in_prompt()}
          onSignIn={onSignIn}
          onCreateAccount={onCreateAccount}
        />
      ) : isNew && !place ? (
        <PlaceSearch
          search={search}
          onPick={pick}
          label={m.session_where()}
          placeholder={m.session_where_placeholder()}
          headClassName={SEARCH_HEAD}
          bodyClassName={SEARCH_BODY}
        >
          {(spots?.length ?? 0) > 0 && (
            <section className="grid gap-xs">
              <h3 className="font-medium">{m.spots_title()}</h3>
              <ul className="-mx-xs grid gap-xxs">
                {spots?.map((spot) => (
                  <SpotRow
                    key={spot.id}
                    spot={spot}
                    onSelect={() => setPicked({ kind: "spot", id: spot.id, name: spot.name })}
                  />
                ))}
              </ul>
            </section>
          )}
          {looked.length > 0 && (
            <section className="grid gap-xs">
              <h3 className="font-medium">{m.recents_title()}</h3>
              <ul className="-mx-xs grid gap-xxs">
                {looked.map((recent) => (
                  <BreakRow
                    key={recent.id}
                    found={recent}
                    onSelect={() => setPicked({ kind: "break", id: recent.id, name: recent.name })}
                  />
                ))}
              </ul>
            </section>
          )}
          {(spots?.length ?? 0) === 0 && looked.length === 0 && (
            <p className="text-s text-neutral-7">{m.session_where_hint()}</p>
          )}
        </PlaceSearch>
      ) : isNew && place ? (
        <SessionForm
          // Another place starts its form over.
          key={`${place.kind} ${place.id}`}
          now={now}
          wide={wide}
          isSaving={sessioning.isSaving}
          onSave={(draft) => void sessioning.onAdd(place, draft)}
        />
      ) : detail.isError ? (
        <p className="text-s text-neutral-7">{m.session_not_found()}</p>
      ) : !session ? (
        <div className="grid gap-s">
          <Skeleton className="h-10 rounded-(--radius-xs)" />
          <Skeleton className="h-10 rounded-(--radius-xs)" />
          <Skeleton className="h-(--line-m) w-3/5 rounded-(--radius-xs)" />
        </div>
      ) : (
        <div className="grid gap-l">
          {/* What a session of the log is opened for comes first: what the sea did. */}
          <div className="grid gap-s">
            <SessionConditions session={session} />
            {/* The models could not be asked when the session was written: they are asked again. */}
            {session.modelMissing === "unavailable" && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  isPending={sessioning.isSaving}
                  onClick={() => void sessioning.onChange(session, {})}
                >
                  {m.session_sea_read()}
                </Button>
              </div>
            )}
          </div>
          <SessionForm
            key={session.id}
            session={session}
            now={now}
            wide={wide}
            isSaving={sessioning.isSaving}
            onSave={(_draft, changed) => void sessioning.onChange(session, changed)}
          />
          <div className="flex flex-wrap items-center gap-xs">
            {(session.place.spotId ?? session.place.breakId) && (
              <Button
                variant="secondary"
                onClick={() => {
                  const { spotId, breakId } = session.place;
                  sessioning.onClose();
                  if (spotId) onOpenPlace({ spotId });
                  else if (breakId) onOpenPlace({ breakId });
                }}
              >
                {m.session_open_place()}
              </Button>
            )}
            {isDeleting ? (
              <>
                <Button
                  variant="destructive"
                  isPending={sessioning.isDeleting}
                  onClick={() => void sessioning.onDelete(session)}
                >
                  {m.session_delete_confirm()}
                </Button>
                <Button variant="ghost" onClick={() => setIsDeleting(false)}>
                  {m.action_cancel()}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setIsDeleting(true)}>
                {m.action_delete()}
              </Button>
            )}
          </div>
          <SessionCredits session={session} />
        </div>
      )}
    </ViewerDrawer>
  );
}
