import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { PlusIcon, TrashIcon, XIcon } from "@repo/ui/icon";
import { useState } from "react";

import { formatMeters, formatSeconds, freshnessOf } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { FreshnessDot, HeightChip } from "./map-markers";
import { listName } from "./station-actions";
import { type Loadable, type SavedList, type Station, periodOf } from "./types";

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

function StationRowSkeleton() {
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

function StationRow({
  station,
  now,
  onSelect,
  onRemove,
}: {
  station: Station;
  now: number;
  onSelect: () => void;
  onRemove: () => void;
}) {
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
          {height === null ? "–" : formatMeters(height)}
          {period !== null && ` · ${formatSeconds(period)}`}
        </span>
        <FreshnessDot freshness={freshness} />
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m.saved_remove_station({ name: station.name })}
        onClick={onRemove}
      >
        <XIcon data-slot="icon" aria-hidden />
      </Button>
    </li>
  );
}

type SavedPanelProps = {
  now: number;
  signedIn: boolean;
  lists: Loadable<SavedList[]>;
  // The stations the lists name, by id. One that is still loading is missing.
  stations: Map<string, Station>;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onSelect: (stationId: string) => void;
  onRemove: (list: SavedList, stationId: string) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (list: SavedList) => void;
};

/** The visitor's lists of stations, the favorites first. */
export function SavedPanel({
  now,
  signedIn,
  lists,
  stations,
  onSignIn,
  onCreateAccount,
  onSelect,
  onRemove,
  onCreateList,
  onDeleteList,
}: SavedPanelProps) {
  const [newName, setNewName] = useState("");
  // Deleting a list takes two presses: the trash, then the button that takes its place.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <AccountPrompt
        text={m.saved_sign_in_prompt()}
        onSignIn={onSignIn}
        onCreateAccount={onCreateAccount}
      />
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
  const isEmpty = all.every((list) => list.stationIds.length === 0);

  return (
    <div className="grid gap-l">
      {lists.isError && <p className="text-s text-neutral-7">{m.saved_load_failed()}</p>}
      {!lists.isError && isEmpty && <p className="text-neutral-7">{m.saved_empty()}</p>}

      {all.map((list) => (
        <section key={list.id} className="grid gap-xs">
          <div className="flex items-center justify-between gap-s">
            <h3 className="min-w-0 truncate font-medium">
              {listName(list)}
              <span className="ml-xs text-s font-normal text-neutral-7 tabular-nums">
                {list.stationIds.length}
              </span>
            </h3>
            {!list.isDefault &&
              (confirmingId === list.id ? (
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.saved_delete_list({ name: list.name })}
                  onClick={() => setConfirmingId(list.id)}
                >
                  <TrashIcon data-slot="icon" aria-hidden />
                </Button>
              ))}
          </div>
          {list.stationIds.length === 0 ? (
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
                    onRemove={() => onRemove(list, stationId)}
                  />
                ) : (
                  <StationRowSkeleton key={stationId} />
                );
              })}
            </ul>
          )}
        </section>
      ))}

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
