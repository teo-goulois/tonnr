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
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { ChevronLeftIcon, PinIcon, SearchIcon, WaveIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type CSSProperties, type ReactNode, type Ref, useEffect, useState } from "react";

import { m } from "@/paraglide/messages.js";

/**
 * Something a search found: a spot of the account's own, a break of the catalogue, a buoy, or a
 * place by its name, which has no id.
 */
export type Found = {
  kind: "spot" | "break" | "station" | "place";
  id?: string;
  name: string;
  // Where it lies, the nearest place first. Left out when the instance does not say.
  where?: string | undefined;
  latitude: number;
  longitude: number;
};

/** A search of the map by a name, as the route answers it. */
export type PlaceSearching = {
  query: string;
  onQueryChange: (query: string) => void;
  // True once enough is typed to search.
  isSearching: boolean;
  spots: Found[];
  breaks: Found[];
  stations: Found[];
  places: Found[];
  isPending: boolean;
  isError: boolean;
  // Whose the places are, to say under them.
  credit: string | undefined;
};

type Group = { value: Found["kind"]; label: string; items: Found[] };

const keyOf = (found: Found) =>
  `${found.kind} ${found.id ?? `${found.name}:${found.latitude},${found.longitude}`}`;

/** What says the kind of a thing that was found, as the lists of the saved panel draw it. */
function Mark({ kind }: { kind: Found["kind"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full",
        kind === "spot"
          ? "bg-color-1 text-neutral-1"
          : kind === "break"
            ? "bg-neutral-10 text-neutral-1"
            : "bg-neutral-3 text-neutral-10",
      )}
    >
      {kind === "break" ? (
        <WaveIcon strokeWidth={1.75} className="size-3.5" />
      ) : kind === "station" ? (
        <span className="size-2 rounded-full bg-neutral-10" />
      ) : (
        <PinIcon className="size-3.5" />
      )}
    </span>
  );
}

type PlaceSearchProps = {
  search: PlaceSearching;
  onPick: (found: Found) => void;
  label: string;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  // What stands before the field on its line: the button that leaves a screen.
  before?: ReactNode;
  // What is shown under the field while nothing is searched.
  children?: ReactNode;
  // The classes of what holds the field, and of what holds the results under it.
  headClassName?: string;
  bodyClassName?: string;
};

/**
 * A field that searches the map by a name, and what it found under it: the account's own spots
 * first, then the breaks of the catalogue, the buoys and the places.
 */
export function PlaceSearch({
  search,
  onPick,
  label,
  placeholder,
  inputRef,
  before,
  children,
  headClassName,
  bodyClassName,
}: PlaceSearchProps) {
  const groups: Group[] = search.isSearching
    ? [
        { value: "spot" as const, label: m.spots_title(), items: search.spots },
        { value: "break" as const, label: m.map_breaks(), items: search.breaks },
        { value: "station" as const, label: m.map_buoys(), items: search.stations },
        { value: "place" as const, label: m.spot_search_places(), items: search.places },
      ].filter((group) => group.items.length > 0)
    : [];
  const found = groups.reduce((count, group) => count + group.items.length, 0);
  const isEmpty = search.isSearching && !search.isPending && found === 0;
  // What the search is doing, or what came of it. Nothing while nothing is searched.
  const status = !search.isSearching
    ? null
    : search.isPending && found === 0
      ? m.spot_search_pending()
      : isEmpty
        ? search.isError
          ? m.search_failed()
          : m.search_empty()
        : m.spot_search_count({ count: found });

  return (
    <Autocomplete
      items={groups}
      // The API has done the search: what it found is shown as it is.
      filter={null}
      inline
      open
      // The first thing found is the one Enter takes, as soon as the answer comes.
      autoHighlight="always"
      itemToStringValue={(one) => (one as Found).name}
      value={search.query}
      onValueChange={(value, details) => {
        // Choosing something opens it. It does not write its name in the search.
        if (details.reason !== "item-press") search.onQueryChange(value);
      }}
    >
      <div className={cn("flex items-center gap-xxs", headClassName)}>
        {before}
        <AutocompleteInput
          ref={inputRef}
          aria-label={label}
          placeholder={placeholder}
          startAddon={search.isPending ? <Spinner className="size-4" /> : <SearchIcon />}
          showClear={search.query.length > 0}
          clearProps={{ "aria-label": m.spot_search_clear() }}
          // A phone asked to find a place offers the key that searches, and corrects no name.
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className={bodyClassName}>
        {!search.isSearching && children}
        <AutocompleteList className="not-empty:px-0">
          {(group: Group) => (
            <AutocompleteGroup key={group.value} items={group.items}>
              <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
              <AutocompleteCollection>
                {(one: Found) => (
                  <AutocompleteItem
                    key={keyOf(one)}
                    value={one}
                    className="min-h-11 gap-xs"
                    onClick={() => onPick(one)}
                  >
                    <Mark kind={one.kind} />
                    <span className="grid min-w-0">
                      <span className="truncate">{one.name}</span>
                      {one.where && (
                        <span className="truncate text-xs text-neutral-7">{one.where}</span>
                      )}
                    </span>
                  </AutocompleteItem>
                )}
              </AutocompleteCollection>
            </AutocompleteGroup>
          )}
        </AutocompleteList>
        {/* What the search is doing and what came of it, said to who cannot see the list. That
            it found nothing, or could not look, is shown too. */}
        <AutocompleteStatus
          className={cn("px-0 font-normal text-neutral-7", !isEmpty && "sr-only")}
        >
          {status && <span className="text-s">{status}</span>}
        </AutocompleteStatus>
        {search.places.length > 0 && search.credit && (
          <p className="mt-xs text-xs text-neutral-7">
            {m.spot_search_credit({ credit: search.credit })}
          </p>
        )}
      </div>
    </Autocomplete>
  );
}

// How much of the screen's bottom a phone's keyboard covers, in pixels. A phone lays its
// keyboard over the page without telling it: what the page shows is read on the visual viewport.
function useKeyboardCover(isOn: boolean) {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isOn || !viewport) return;
    const measure = () =>
      setCover(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      setCover(0);
    };
  }, [isOn]);
  return cover;
}

type SearchScreenProps = Pick<PlaceSearchProps, "search" | "onPick" | "inputRef" | "children"> & {
  open: boolean;
  onClose: () => void;
};

/**
 * The search of the map as a phone shows it: the whole screen, with the field at its top and
 * what it found under it, above the keyboard. Decision 040.
 */
export function SearchScreen({
  open,
  onClose,
  search,
  onPick,
  inputRef,
  children,
}: SearchScreenProps) {
  const cover = useKeyboardCover(open);
  if (!open) return null;

  return (
    <section
      aria-label={m.search_title()}
      className="absolute inset-0 z-20 flex flex-col bg-neutral-1"
      // What is found ends above the keyboard, or above the bar of tabs when there is none.
      style={
        {
          "--search-foot": `max(${cover}px, calc(var(--spacing-m) + var(--bottom-nav-lift, 0px)))`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <PlaceSearch
        search={search}
        onPick={onPick}
        label={m.search_title()}
        placeholder={m.search_placeholder()}
        inputRef={inputRef}
        before={
          <Button
            variant="ghost"
            size="icon"
            className="-ml-xs shrink-0"
            aria-label={m.action_back()}
            onClick={onClose}
          >
            <ChevronLeftIcon data-slot="icon" aria-hidden />
          </Button>
        }
        headClassName="px-m pt-m"
        bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain px-m pt-s pb-(--search-foot)"
      >
        {children}
      </PlaceSearch>
    </section>
  );
}
