import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  LockIcon,
  MapIcon,
  PinIcon,
  PinPlusIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
  WaveIcon,
  XIcon,
} from "@repo/ui/icon";
import { useState } from "react";

import { formatSeconds, freshnessOf } from "@/lib/format";
import type { Recent } from "@/lib/recents";
import { formatHeight, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { FreshnessDot, HeightChip } from "./map-markers";
import { ListChips } from "../lists/list-chips";
import { listName, sizeOf } from "./station-actions";
import {
  type JoinedList,
  type Loadable,
  type SavedBreak,
  type SavedItem,
  type SavedList,
  type Spot,
  type Station,
  periodOf,
} from "./types";

/** What a visitor without an account sees where saved things would be. */
export function AccountPrompt({
  text,
  onSignIn,
  onCreateAccount,
}: {
  text: string;
  onSignIn: () => void;
  onCreateAccount: () => void;
}) {
  return (
    <div className="grid gap-m">
      <p className="text-neutral-7">{text}</p>
      <div className="flex flex-wrap gap-xs">
        <Button onClick={onCreateAccount}>{m.auth_create_account()}</Button>
        <Button variant="outline" onClick={onSignIn}>
          {m.auth_sign_in()}
        </Button>
      </div>
    </div>
  );
}

const rowLayout = "flex min-h-11 min-w-0 flex-1 items-center gap-xs rounded-(--radius-xs) px-xs";

export function StationRowSkeleton() {
  return (
    <li className="flex items-center gap-xxs">
      <div className={rowLayout}>
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-(--line-s) w-2/5 rounded-(--radius-xs)" />
        <Skeleton className="ml-auto h-(--line-s) w-16 rounded-(--radius-xs)" />
      </div>
      <div className="size-8" />
    </li>
  );
}

/** A station in a list: what it reads now. Whoever owns the list can take it out. */
export function StationRow({
  station,
  now,
  onSelect,
  onRemove,
}: {
  station: Station;
  now: number;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  // The height is written in the reader's unit.
  useUnits();
  const reading = station.latestReading;
  const freshness = freshnessOf(reading?.observedAt, now);
  const height = freshness === "none" ? null : (reading?.significantHeightMeters ?? null);
  const period = freshness === "none" ? null : periodOf(reading);

  return (
    <li className="flex items-center gap-xxs">
      <button
        type="button"
        className={`${rowLayout} focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
        onClick={onSelect}
      >
        {height === null ? (
          <span aria-hidden className="size-6 shrink-0 rounded-full bg-neutral-3" />
        ) : (
          <HeightChip
            heightMeters={height}
            directionDegrees={reading?.peakDirectionDegrees ?? null}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{station.name}</span>
        <span className="shrink-0 text-s text-neutral-7 tabular-nums">
          {height === null ? "–" : formatHeight(height)}
          {period !== null && ` · ${formatSeconds(period)}`}
        </span>
        <FreshnessDot freshness={freshness} />
      </button>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.saved_remove_station({ name: station.name })}
          onClick={onRemove}
        >
          <XIcon data-slot="icon" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** A surf break in a list: its name, where a station also says what it reads. */
export function BreakRow({
  found,
  onSelect,
  onRemove,
}: {
  found: Pick<SavedBreak, "name">;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-xxs">
      <button
        type="button"
        className={`${rowLayout} focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
        onClick={onSelect}
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-10 text-neutral-1"
        >
          <WaveIcon strokeWidth={1.75} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{found.name}</span>
      </button>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.saved_remove_station({ name: found.name })}
          onClick={onRemove}
        >
          <XIcon data-slot="icon" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/** A spot of the user's own: its name, which opens it. In a list, it can be taken out of it. */
export function SpotRow({
  spot,
  onSelect,
  onRemove,
}: {
  spot: Pick<Spot, "name">;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-xxs">
      <button
        type="button"
        className={`${rowLayout} focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
        onClick={onSelect}
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-color-1 text-neutral-1"
        >
          <PinIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{spot.name}</span>
      </button>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.saved_remove_station({ name: spot.name })}
          onClick={onRemove}
        >
          <XIcon data-slot="icon" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/**
 * What the reader looked at last, the last first: a press opens it again. Nothing is drawn when
 * nothing was looked at.
 */
export function RecentPlaces({
  recents,
  onSelect,
  onSelectBreak,
  onSelectSpot,
  onClear,
}: {
  recents: Recent[];
  onSelect: (stationId: string) => void;
  onSelectBreak: (breakId: string) => void;
  onSelectSpot: (spotId: string) => void;
  onClear: () => void;
}) {
  if (recents.length === 0) return null;
  return (
    <section className="grid gap-xs">
      <div className="flex items-center justify-between gap-s">
        <h3 className="min-w-0 truncate font-medium">{m.recents_title()}</h3>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {m.recents_clear()}
        </Button>
      </div>
      <ul className="-mx-xs grid gap-xxs">
        {recents.map((recent) =>
          recent.kind === "break" ? (
            <BreakRow
              key={`break ${recent.id}`}
              found={recent}
              onSelect={() => onSelectBreak(recent.id)}
            />
          ) : recent.kind === "spot" ? (
            <SpotRow
              key={`spot ${recent.id}`}
              spot={recent}
              onSelect={() => onSelectSpot(recent.id)}
            />
          ) : (
            <li key={`station ${recent.id}`} className="flex items-center gap-xxs">
              <button
                type="button"
                className={`${rowLayout} focus-ring cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
                onClick={() => onSelect(recent.id)}
              >
                <span aria-hidden className="size-6 shrink-0 rounded-full bg-neutral-3" />
                <span className="min-w-0 flex-1 truncate">{recent.name}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

type SavedPanelProps = {
  now: number;
  signedIn: boolean;
  lists: Loadable<SavedList[]>;
  // The stations and the surf breaks the lists name, by id. One that is still loading is missing.
  stations: Map<string, Station>;
  breaks: Map<string, SavedBreak>;
  // The user's own spots: all of them come first, and a list shows those it holds.
  spots: Loadable<Spot[]>;
  onSelectSpot: (spotId: string) => void;
  onAddSpot: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onSelect: (stationId: string) => void;
  onSelectBreak: (breakId: string) => void;
  onRemove: (list: SavedList, item: SavedItem) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (list: SavedList) => void;
  // Shows a list alone on the map, and opens what shares it.
  onViewList: (listId: string) => void;
  onShareList: (list: SavedList) => void;
  // The lists of others that the account opened by their link and kept.
  joined: JoinedList[];
  // What the reader looked at last, which a visitor has too.
  recents: Recent[];
  onClearRecents: () => void;
};

/** The visitor's spots, then their lists of stations, surf breaks and spots, the favorites first. */
export function SavedPanel({
  now,
  signedIn,
  lists,
  stations,
  breaks,
  spots,
  onSelectSpot,
  onAddSpot,
  onSignIn,
  onCreateAccount,
  onSelect,
  onSelectBreak,
  onRemove,
  onCreateList,
  onDeleteList,
  onViewList,
  onShareList,
  joined,
  recents,
  onClearRecents,
}: SavedPanelProps) {
  const [newName, setNewName] = useState("");
  // Deleting a list takes two presses: the trash, then the button that takes its place.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const recentPlaces = (
    <RecentPlaces
      recents={recents}
      onSelect={onSelect}
      onSelectBreak={onSelectBreak}
      onSelectSpot={onSelectSpot}
      onClear={onClearRecents}
    />
  );

  if (!signedIn) {
    return (
      <div className="grid gap-l">
        <AccountPrompt
          text={m.saved_sign_in_prompt()}
          onSignIn={onSignIn}
          onCreateAccount={onCreateAccount}
        />
        {recentPlaces}
      </div>
    );
  }

  if (lists.isPending) {
    return (
      <div className="grid gap-xs">
        <Skeleton className="h-(--line-m) w-24 rounded-(--radius-xs)" />
        <ul className="grid gap-xxs">
          <StationRowSkeleton />
          <StationRowSkeleton />
          <StationRowSkeleton />
        </ul>
      </div>
    );
  }

  const all = lists.data ?? [];
  const pick = (listId: string | undefined) => {
    if (listId) onViewList(listId);
  };
  const isEmpty = all.every((list) => sizeOf(list) === 0);
  const ownSpots = new Map((spots.data ?? []).map((spot) => [spot.id, spot]));

  return (
    <div className="grid gap-l">
      <ListChips lists={all} joined={joined} current={undefined} onPick={pick} />
      {recentPlaces}
      <section className="grid gap-xs">
        <div className="flex items-center justify-between gap-s">
          <h3 className="min-w-0 truncate font-medium">
            {m.spots_title()}
            {spots.data && (
              <span className="ml-xs text-s font-normal text-neutral-7 tabular-nums">
                {spots.data.length}
              </span>
            )}
          </h3>
          <Button variant="secondary" size="sm" onClick={onAddSpot}>
            <PinPlusIcon data-slot="icon" aria-hidden />
            {m.spot_add()}
          </Button>
        </div>
        {spots.isError ? (
          <p className="text-s text-neutral-7">{m.spots_load_failed()}</p>
        ) : spots.isPending ? (
          <ul className="-mx-xs grid gap-xxs">
            <StationRowSkeleton />
          </ul>
        ) : spots.data?.length ? (
          <>
            <p className="flex items-center gap-xxs text-s text-neutral-7">
              <LockIcon aria-hidden className="size-3.5 shrink-0" />
              {m.spots_private()}
            </p>
            <ul className="-mx-xs grid gap-xxs">
              {spots.data.map((spot) => (
                <SpotRow key={spot.id} spot={spot} onSelect={() => onSelectSpot(spot.id)} />
              ))}
            </ul>
          </>
        ) : (
          <p className="text-s text-neutral-7">{m.spots_empty()}</p>
        )}
      </section>

      {lists.isError && <p className="text-s text-neutral-7">{m.saved_load_failed()}</p>}
      {!lists.isError && isEmpty && <p className="text-neutral-7">{m.saved_empty()}</p>}

      {all.map((list) => (
        <section key={list.id} className="grid gap-xs">
          <div className="flex items-center justify-between gap-s">
            <h3 className="min-w-0 truncate font-medium">
              {listName(list)}
              <span className="ml-xs text-s font-normal text-neutral-7 tabular-nums">
                {sizeOf(list)}
              </span>
            </h3>
            {confirmingId === list.id ? (
              <div className="flex shrink-0 items-center gap-xxs">
                <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                  {m.action_cancel()}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  aria-label={m.saved_delete_list({ name: list.name })}
                  onClick={() => {
                    setConfirmingId(null);
                    onDeleteList(list);
                  }}
                >
                  {m.action_delete()}
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-xxs">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={list.share !== null}
                  aria-label={
                    list.share
                      ? m.share_action_on({ name: listName(list) })
                      : m.share_action_of({ name: listName(list) })
                  }
                  onClick={() => onShareList(list)}
                >
                  <ShareIcon
                    data-slot="icon"
                    aria-hidden
                    className={list.share ? "text-color-1" : undefined}
                  />
                </Button>
                {!list.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.saved_delete_list({ name: list.name })}
                    onClick={() => setConfirmingId(list.id)}
                  >
                    <TrashIcon data-slot="icon" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
          {sizeOf(list) === 0 ? (
            <p className="text-s text-neutral-7">{m.saved_list_empty()}</p>
          ) : (
            <ul className="-mx-xs grid gap-xxs">
              {list.stationIds.map((stationId) => {
                const station = stations.get(stationId);
                return station ? (
                  <StationRow
                    key={stationId}
                    station={station}
                    now={now}
                    onSelect={() => onSelect(stationId)}
                    onRemove={() => onRemove(list, { stationId })}
                  />
                ) : (
                  <StationRowSkeleton key={stationId} />
                );
              })}
              {list.breakIds.map((breakId) => {
                const found = breaks.get(breakId);
                return found ? (
                  <BreakRow
                    key={breakId}
                    found={found}
                    onSelect={() => onSelectBreak(breakId)}
                    onRemove={() => onRemove(list, { breakId })}
                  />
                ) : (
                  <StationRowSkeleton key={breakId} />
                );
              })}
              {list.spotIds.map((spotId) => {
                const spot = ownSpots.get(spotId);
                return spot ? (
                  <SpotRow
                    key={spotId}
                    spot={spot}
                    onSelect={() => onSelectSpot(spotId)}
                    onRemove={() => onRemove(list, { spotId })}
                  />
                ) : (
                  // A spot the list names before the account's spots are read. One that was
                  // deleted meanwhile leaves no row.
                  spots.isPending && <StationRowSkeleton key={spotId} />
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {joined.length > 0 && (
        <section className="grid gap-xs">
          <h3 className="font-medium">{m.lists_joined()}</h3>
          <ul className="-mx-xs grid gap-xxs">
            {joined.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  className={`${rowLayout} focus-ring w-full cursor-pointer text-left outline-none hover:bg-neutral-3-transparent`}
                  onClick={() => onViewList(list.id)}
                >
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-3 text-neutral-10"
                  >
                    <MapIcon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{listName(list)}</span>
                  <span className="shrink-0 text-s text-neutral-7 tabular-nums">{list.size}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        className="flex items-center gap-xs"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (!name) return;
          onCreateList(name);
          setNewName("");
        }}
      >
        <Input
          aria-label={m.saved_new_list()}
          placeholder={m.saved_new_list()}
          maxLength={60}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="icon" aria-label={m.saved_create_list()}>
          <PlusIcon data-slot="icon" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
