import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
import { BookmarkFillIcon, BookmarkIcon, ListsIcon, PlusIcon } from "@repo/ui/icon";
import { useState } from "react";

import { type Freshness, formatAgo } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { FreshnessDot } from "./map-markers";
import type { SavedItem, SavedList } from "./types";

/** The name a list goes by. The favorites take the reader's language, the others their own name. */
export function listName(list: Pick<SavedList, "name" | "isDefault">) {
  return list.isDefault ? m.saved_favorites() : list.name;
}

/** Whether a list holds a station, a surf break or a spot. */
export function holds(list: SavedList, item: SavedItem) {
  if ("spotId" in item) return list.spotIds.includes(item.spotId);
  return "breakId" in item
    ? list.breakIds.includes(item.breakId)
    : list.stationIds.includes(item.stationId);
}

/** How many things a list holds, of every kind. */
export function sizeOf(list: SavedList) {
  return list.stationIds.length + list.breakIds.length + list.spotIds.length;
}

/** How recent a station's latest reading is, in words and with its dot. */
export function ReadingAge({
  observedAt,
  freshness,
  now,
}: {
  observedAt: Date | null | undefined;
  freshness: Freshness;
  now: number;
}) {
  return (
    <span className="flex items-center gap-xs">
      <FreshnessDot freshness={freshness} />
      {observedAt ? formatAgo(observedAt, now) : m.station_no_recent_reading()}
    </span>
  );
}

type StationActionsProps = {
  // The station, the surf break or the spot to save.
  item: SavedItem;
  // Undefined for a visitor without an account, who only sees the bookmark: it offers to sign in.
  lists: SavedList[] | undefined;
  onToggleFavorite: () => void;
  onToggleList: (list: SavedList, add: boolean) => void;
  // Makes a list by that name, with the item in it.
  onCreateList: (name: string) => void;
  onManageLists: () => void;
};

// A list's name, as long as the API takes it.
const NAME_MOST = 60;

/**
 * Saves a station, a surf break or a spot of the user's own: the bookmark for the favorites, the menu
 * for the other lists.
 */
export function StationActions({
  item,
  lists,
  onToggleFavorite,
  onToggleList,
  onCreateList,
  onManageLists,
}: StationActionsProps) {
  const isFavorite = lists?.some((list) => list.isDefault && holds(list, item)) ?? false;
  // The favorites exist from the first thing saved to them: the menu has them before that.
  const hasFavorites = lists?.some((list) => list.isDefault) ?? false;
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-pressed={isFavorite}
        aria-label={isFavorite ? m.saved_remove_favorite() : m.saved_add_favorite()}
        onClick={onToggleFavorite}
      >
        {isFavorite ? (
          <BookmarkFillIcon data-slot="icon" aria-hidden />
        ) : (
          <BookmarkIcon data-slot="icon" aria-hidden />
        )}
      </Button>
      {lists && (
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={m.saved_add_to_list()} />}
          >
            <ListsIcon data-slot="icon" aria-hidden />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>{m.saved_add_to_list()}</MenuGroupLabel>
              {!hasFavorites && (
                <MenuCheckboxItem
                  checked={false}
                  onCheckedChange={onToggleFavorite}
                  closeOnClick={false}
                >
                  {m.saved_favorites()}
                </MenuCheckboxItem>
              )}
              {lists.map((list) => (
                <MenuCheckboxItem
                  key={list.id}
                  checked={holds(list, item)}
                  onCheckedChange={(checked) => onToggleList(list, checked)}
                  // Several lists can be ticked in a row.
                  closeOnClick={false}
                >
                  {listName(list)}
                </MenuCheckboxItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
            <MenuItem onClick={() => setIsNaming(true)}>
              <PlusIcon aria-hidden className="size-3.5" />
              {m.saved_new_list_here()}
            </MenuItem>
            <MenuItem onClick={onManageLists}>{m.saved_manage_lists()}</MenuItem>
          </MenuPopup>
        </Menu>
      )}

      <Dialog
        open={isNaming}
        onOpenChange={(open) => {
          setIsNaming(open);
          if (!open) setName("");
        }}
      >
        <DialogPopup className="w-full max-w-sm gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>{m.saved_new_list()}</DialogTitle>
            <DialogDescription>{m.saved_new_list_text()}</DialogDescription>
          </div>
          <form
            className="grid gap-l"
            onSubmit={(event) => {
              event.preventDefault();
              const named = name.trim();
              if (!named) return;
              onCreateList(named);
              setIsNaming(false);
              setName("");
            }}
          >
            <Input
              aria-label={m.saved_list_name()}
              placeholder={m.saved_list_name()}
              maxLength={NAME_MOST}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="flex justify-end gap-xs">
              <Button type="button" variant="ghost" onClick={() => setIsNaming(false)}>
                {m.action_cancel()}
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                {m.saved_create_list()}
              </Button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
