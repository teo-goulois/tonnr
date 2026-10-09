import { Button } from "@repo/ui/components/ui/button";
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
import { ListsIcon, StarBoldIcon, StarIcon } from "@repo/ui/icon";

import { type Freshness, formatAgo } from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { FreshnessDot } from "./map-markers";
import type { SavedItem, SavedList } from "./types";

/** The name a list goes by. The favorites take the reader's language, the others their own name. */
export function listName(list: Pick<SavedList, "name" | "isDefault">) {
  return list.isDefault ? m.saved_favorites() : list.name;
}

/** Whether a list holds a station or a surf break. */
export function holds(list: SavedList, item: SavedItem) {
  return "breakId" in item
    ? list.breakIds.includes(item.breakId)
    : list.stationIds.includes(item.stationId);
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
  // The station or the surf break to save.
  item: SavedItem;
  // Undefined for a visitor without an account, who only sees the star: it offers to sign in.
  lists: SavedList[] | undefined;
  onToggleFavorite: () => void;
  onToggleList: (list: SavedList, add: boolean) => void;
  onManageLists: () => void;
};

/** Saves a station or a surf break: the star for the favorites, the menu for the other lists. */
export function StationActions({
  item,
  lists,
  onToggleFavorite,
  onToggleList,
  onManageLists,
}: StationActionsProps) {
  const isFavorite = lists?.some((list) => list.isDefault && holds(list, item)) ?? false;

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
          <StarBoldIcon data-slot="icon" aria-hidden />
        ) : (
          <StarIcon data-slot="icon" aria-hidden />
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
            {lists.length > 0 && <MenuSeparator />}
            <MenuItem onClick={onManageLists}>{m.saved_manage_lists()}</MenuItem>
          </MenuPopup>
        </Menu>
      )}
    </>
  );
}
