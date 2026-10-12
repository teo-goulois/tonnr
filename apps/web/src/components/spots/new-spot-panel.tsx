import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
} from "@repo/ui/components/ui/autocomplete";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { LockIcon, PinIcon, SearchIcon, WaveIcon } from "@repo/ui/icon";
import { useId } from "react";

import { m } from "@/paraglide/messages.js";

import type { Loadable } from "../viewer/types";

/** Somewhere the search found: a surf break of the catalogue, or a place by its name. */
export type FoundPlace = {
  name: string;
  // The places it lies in, from the widest to the nearest. None for a break that says none.
  location: string[];
  latitude: number;
  longitude: number;
  // The break of the catalogue it is, when it is one.
  breakId?: string;
};

/** The spot being added, as far as it has got. */
export type SpotDraft = {
  name: string;
  // Where the marker stands. Null until it is put somewhere.
  point: { latitude: number; longitude: number } | null;
  // The break of the catalogue the marker stands on.
  breakId?: string | undefined;
};

/** What the search has for what is typed. */
export type SpotSearch = {
  breaks: Loadable<FoundPlace[]>;
  places: Loadable<FoundPlace[]>;
  // Whose the places are, to say under them.
  credit: string | undefined;
};

// The search asks from this many characters: fewer find the whole world.
export const SEARCH_FROM = 3;
// A name as the API takes it.
const NAME_MOST = 80;

type Group = { value: "breaks" | "places"; label: string; items: FoundPlace[] };

const keyOf = (found: FoundPlace) =>
  found.breakId ?? `${found.name}:${found.latitude},${found.longitude}`;

// The nearest places first, as an address is read.
const where = (found: FoundPlace) => [...found.location].reverse().slice(0, 3).join(", ");

type NewSpotPanelProps = {
  query: string;
  onQueryChange: (query: string) => void;
  search: SpotSearch;
  // Puts the marker on what the search found.
  onPick: (found: FoundPlace) => void;
  draft: SpotDraft;
  onNameChange: (name: string) => void;
  // A spot the account already has where the marker stands.
  near: { id: string; name: string } | undefined;
  onOpenSpot: (id: string) => void;
  // True when the account holds all the spots it may.
  isFull: boolean;
  isSaving: boolean;
  onSave: () => void;
};

/**
 * Adding a spot: find the place, put the marker, name it. The map beside the panel takes the
 * presses that put the marker, and shows it.
 */
export function NewSpotPanel({
  query,
  onQueryChange,
  search,
  onPick,
  draft,
  onNameChange,
  near,
  onOpenSpot,
  isFull,
  isSaving,
  onSave,
}: NewSpotPanelProps) {
  const nameId = useId();
  const isSearching = query.trim().length >= SEARCH_FROM;
  const groups: Group[] = isSearching
    ? [
        { value: "breaks" as const, label: m.map_breaks(), items: search.breaks.data ?? [] },
        {
          value: "places" as const,
          label: m.spot_search_places(),
          items: search.places.data ?? [],
        },
      ].filter((group) => group.items.length > 0)
    : [];
  const isPending = isSearching && (search.breaks.isPending || search.places.isPending);
  const found = groups.reduce((count, group) => count + group.items.length, 0);
  const isUnavailable = isSearching && !isPending && search.places.isError;
  const isEmpty = isSearching && !isPending && found === 0 && !isUnavailable;
  // What the search is doing, or what came of it. Nothing while nothing is searched.
  const status = isPending
    ? m.spot_search_pending()
    : isUnavailable
      ? m.spot_search_unavailable()
      : isEmpty
        ? m.spot_search_empty()
        : isSearching
          ? m.spot_search_count({ count: found })
          : null;
  const name = draft.name.trim();

  if (isFull) return <p className="text-neutral-7">{m.spot_full()}</p>;

  return (
    <div className="grid gap-l">
      <div className="grid gap-xs">
        <Autocomplete
          items={groups}
          // The API has done the search: what it found is shown as it is.
          filter={null}
          inline
          open
          // The first place found is the one Enter takes, as soon as the answer comes.
          autoHighlight="always"
          itemToStringValue={(found) => (found as FoundPlace).name}
          value={query}
          onValueChange={(value, details) => {
            // Choosing a place puts the marker. It does not write the place's name in the search.
            if (details.reason !== "item-press") onQueryChange(value);
          }}
        >
          <AutocompleteInput
            aria-label={m.spot_search_label()}
            placeholder={m.spot_search_placeholder()}
            startAddon={isPending ? <Spinner className="size-4" /> : <SearchIcon />}
            showClear={query.length > 0}
            clearProps={{ "aria-label": m.spot_search_clear() }}
            disabled={isSaving}
            // A phone asked to find a place offers the key that searches.
            enterKeyHint="search"
            autoComplete="off"
          />
          <AutocompleteList className="not-empty:px-0">
            {(group: Group) => (
              <AutocompleteGroup key={group.value} items={group.items}>
                <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
                <AutocompleteCollection>
                  {(found: FoundPlace) => (
                    <AutocompleteItem
                      key={keyOf(found)}
                      value={found}
                      className="min-h-11 gap-xs"
                      onClick={() => onPick(found)}
                    >
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-3 text-neutral-10"
                      >
                        {found.breakId ? (
                          <WaveIcon strokeWidth={1.75} className="size-3.5" />
                        ) : (
                          <PinIcon className="size-3.5" />
                        )}
                      </span>
                      <span className="grid min-w-0">
                        <span className="truncate">{found.name}</span>
                        {found.location.length > 0 && (
                          <span className="truncate text-xs text-neutral-7">{where(found)}</span>
                        )}
                      </span>
                    </AutocompleteItem>
                  )}
                </AutocompleteCollection>
              </AutocompleteGroup>
            )}
          </AutocompleteList>
          {/* What the search is doing and what came of it, said to who cannot see the list. What
              it could not do is shown too: the map still takes the marker. */}
          <AutocompleteStatus
            className={cn(
              "px-0 font-normal text-neutral-7",
              !isEmpty && !isUnavailable && "sr-only",
            )}
          >
            {status && <span className="text-s">{status}</span>}
          </AutocompleteStatus>
        </Autocomplete>

        {search.places.data && search.places.data.length > 0 && isSearching && search.credit && (
          <p className="text-xs text-neutral-7">
            {m.spot_search_credit({ credit: search.credit })}
          </p>
        )}
        {!draft.point && <p className="text-s text-neutral-7">{m.spot_place_hint()}</p>}
      </div>

      {draft.point && (
        <form
          className="grid gap-m"
          onSubmit={(event) => {
            event.preventDefault();
            if (name && !isSaving) onSave();
          }}
        >
          <div className="grid gap-xxs">
            <p className="text-s text-neutral-7">{m.spot_marker_hint()}</p>
            <p className="text-xs text-neutral-7 tabular-nums">
              {draft.point.latitude.toFixed(5)}, {draft.point.longitude.toFixed(5)}
            </p>
          </div>

          {near && (
            <p className="flex flex-wrap items-center gap-xs text-s">
              {m.spot_near({ name: near.name })}
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenSpot(near.id)}>
                {m.spot_near_open()}
              </Button>
            </p>
          )}

          <div className="grid gap-xs">
            <Label htmlFor={nameId}>{m.spot_name_label()}</Label>
            <Input
              id={nameId}
              value={draft.name}
              maxLength={NAME_MOST}
              placeholder={m.spot_name_placeholder()}
              autoComplete="off"
              disabled={isSaving}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>

          <div className="grid gap-xs">
            <Button type="submit" disabled={!name} isPending={isSaving}>
              {m.spot_save()}
            </Button>
            {/* Said before the spot is saved: nobody publishes a secret spot by accident. */}
            <p className="flex items-start gap-xxs text-s text-neutral-7">
              <LockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {m.spot_private_hint()}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
