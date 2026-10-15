import { Button } from "@repo/ui/components/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@repo/ui/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerMenu,
  DrawerMenuCheckboxItem,
  DrawerMenuItem,
  DrawerMenuSeparator,
  DrawerPanel,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
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
import { ArrowLeftIcon, BookmarkFillIcon, BookmarkIcon, PlusIcon } from "@repo/ui/icon";
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
  // Undefined for a visitor without an account: the bookmark offers to sign in.
  lists: SavedList[] | undefined;
  // A wide screen chooses the lists in a menu, a phone in a sheet.
  wide: boolean;
  onToggleFavorite: () => void;
  onToggleList: (list: SavedList, add: boolean) => void;
  // Makes a list by that name, with the item in it.
  onCreateList: (name: string) => void;
  onManageLists: () => void;
};

// A list's name, as long as the API takes it.
const NAME_MOST = 60;

/**
 * Saves a station, a surf break or a spot of the user's own: one bookmark, filled while a list
 * holds it, which opens the lists, the favorites first. A wide screen gets a menu and a dialog
 * to name a new list. A phone gets a sheet, where a new list is named in a second step of the
 * same sheet rather than in a sheet over it.
 */
export function StationActions({
  item,
  lists,
  wide,
  onToggleFavorite,
  onToggleList,
  onCreateList,
  onManageLists,
}: StationActionsProps) {
  const isSaved = lists?.some((list) => holds(list, item)) ?? false;
  // The favorites exist from the first thing saved to them: the lists offer them before that.
  const hasFavorites = lists?.some((list) => list.isDefault) ?? false;
  const [isOpen, setIsOpen] = useState(false);
  const [isNaming, setIsNaming] = useState(false);

  const bookmark = isSaved ? (
    <BookmarkFillIcon data-slot="icon" aria-hidden />
  ) : (
    <BookmarkIcon data-slot="icon" aria-hidden />
  );

  if (!lists) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.saved_add_favorite()}
        onClick={onToggleFavorite}
      >
        {bookmark}
      </Button>
    );
  }

  // The favorites come first, as a list, even before they exist.
  const choices = [
    ...(hasFavorites ? [] : [{ key: "favorites", name: m.saved_favorites(), checked: false }]),
    ...lists.map((list) => ({ key: list.id, name: listName(list), checked: holds(list, item) })),
  ];
  function choose(key: string, checked: boolean) {
    const list = lists?.find((one) => one.id === key);
    if (list) onToggleList(list, checked);
    else onToggleFavorite();
  }
  function create(name: string) {
    onCreateList(name);
    setIsNaming(false);
  }

  if (!wide) {
    return (
      <Drawer
        showSwipeHandle
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setIsNaming(false);
        }}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.saved_add_to_list()}
          onClick={() => setIsOpen(true)}
        >
          {bookmark}
        </Button>
        <DrawerContent variant="edge">
          {isNaming ? (
            <>
              <DrawerHeader className="flex-row items-center gap-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.action_back()}
                  onClick={() => setIsNaming(false)}
                >
                  <ArrowLeftIcon data-slot="icon" aria-hidden />
                </Button>
                <DrawerTitle>{m.saved_new_list()}</DrawerTitle>
              </DrawerHeader>
              <DrawerPanel>
                <ListNameForm onCreate={create} />
              </DrawerPanel>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>{m.saved_add_to_list()}</DrawerTitle>
              </DrawerHeader>
              <DrawerPanel>
                <DrawerMenu>
                  {choices.map((choice) => (
                    <DrawerMenuCheckboxItem
                      key={choice.key}
                      checked={choice.checked}
                      onCheckedChange={(checked) => choose(choice.key, checked)}
                    >
                      {choice.name}
                    </DrawerMenuCheckboxItem>
                  ))}
                  <DrawerMenuSeparator />
                  <DrawerMenuItem onClick={() => setIsNaming(true)}>
                    <PlusIcon aria-hidden />
                    {m.saved_new_list_here()}
                  </DrawerMenuItem>
                  <DrawerMenuItem
                    onClick={() => {
                      setIsOpen(false);
                      onManageLists();
                    }}
                  >
                    {m.saved_manage_lists()}
                  </DrawerMenuItem>
                </DrawerMenu>
              </DrawerPanel>
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={m.saved_add_to_list()} />}
        >
          {bookmark}
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-56">
          <MenuGroup>
            <MenuGroupLabel>{m.saved_add_to_list()}</MenuGroupLabel>
            {choices.map((choice) => (
              <MenuCheckboxItem
                key={choice.key}
                checked={choice.checked}
                onCheckedChange={(checked) => choose(choice.key, checked)}
                // Several lists can be ticked in a row.
                closeOnClick={false}
              >
                {choice.name}
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

      <Dialog open={isNaming} onOpenChange={setIsNaming}>
        <DialogPopup className="w-full max-w-sm gap-l p-l">
          <div className="grid gap-xs">
            <DialogTitle>{m.saved_new_list()}</DialogTitle>
            <DialogDescription>{m.saved_new_list_text()}</DialogDescription>
          </div>
          <ListNameForm onCreate={create} onCancel={() => setIsNaming(false)} />
        </DialogPopup>
      </Dialog>
    </>
  );
}

/** The name of a new list, which is made with the item in it. */
function ListNameForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void;
  // A dialog has a button to cancel. A sheet goes back, or is swiped away.
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="grid gap-l"
      onSubmit={(event) => {
        event.preventDefault();
        const named = name.trim();
        if (named) onCreate(named);
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
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.action_cancel()}
          </Button>
        )}
        <Button type="submit" disabled={!name.trim()} className={onCancel ? undefined : "w-full"}>
          {m.saved_create_list()}
        </Button>
      </div>
    </form>
  );
}
