import { Button } from "@repo/ui/components/ui/button";
import type { RefObject } from "react";

import type { Recent } from "@/lib/recents";
import { m } from "@/paraglide/messages.js";

import {
  type Found,
  PlaceSearch,
  type PlaceSearching,
  SEARCH_BODY,
  SEARCH_HEAD,
} from "../viewer/place-search";
import { BreakRow, SpotRow } from "../viewer/saved-panel";
import type { Spot } from "../viewer/types";
import { ViewerDrawer } from "../viewer/viewer-drawer";

type AlertPlaceSheetProps = {
  open: boolean;
  onClose: () => void;
  wide: boolean;
  // The search that finds where the alert goes: the account's spots and the breaks.
  search: PlaceSearching;
  // The field, which whoever opens the sheet focuses in the same turn, for a phone's keyboard.
  inputRef: RefObject<HTMLInputElement | null>;
  // What is offered before a name is typed: the account's spots, and the breaks looked at last.
  spots: Spot[] | undefined;
  recents: Recent[];
  // A place the alert goes on: a spot of the account's, or a surf break of the catalogue, which
  // takes an alert of its own as a spot does (decision 064).
  onSpot: (spot: { id: string; name: string }) => void;
  onBreak: (found: { id: string; name: string }) => void;
  onAddSpot: () => void;
};

/**
 * Where a new alert goes, asked as a session asks where it was: a spot of the account's own, or a
 * break of the catalogue, found by its name or among those looked at last. Decision 031.
 */
export function AlertPlaceSheet({
  open,
  onClose,
  wide,
  search,
  inputRef,
  spots,
  recents,
  onSpot,
  onBreak,
  onAddSpot,
}: AlertPlaceSheetProps) {
  const looked = recents.filter((recent) => recent.kind === "break");
  const pick = (found: Found) => {
    if (!found.id) return;
    if (found.kind === "spot") onSpot({ id: found.id, name: found.name });
    else if (found.kind === "break") onBreak({ id: found.id, name: found.name });
  };

  return (
    <ViewerDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      wide={wide}
      title={m.alert_new()}
      description={m.create_alert_spot()}
      // As tall as a sheet goes whatever was found, with the field in place over what scrolls.
      fill
      initialFocus={inputRef}
      // Safari may still scroll the page as its keyboard comes up for that field: once the sheet
      // is at rest, the page is put back where it stands.
      onRest={(rested) => {
        if (rested && window.scrollY !== 0) window.scrollTo(0, 0);
      }}
    >
      <PlaceSearch
        search={search}
        onPick={pick}
        label={m.create_alert_spot()}
        placeholder={m.session_where_placeholder()}
        inputRef={inputRef}
        headClassName={SEARCH_HEAD}
        bodyClassName={SEARCH_BODY}
      >
        {(spots?.length ?? 0) > 0 && (
          <section className="grid gap-xs">
            <h3 className="font-medium">{m.spots_title()}</h3>
            <ul className="-mx-xs grid gap-xxs">
              {spots?.map((spot) => (
                <SpotRow key={spot.id} spot={spot} onSelect={() => onSpot(spot)} />
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
                  onSelect={() => onBreak({ id: recent.id, name: recent.name })}
                />
              ))}
            </ul>
          </section>
        )}
        <div className="grid justify-items-start gap-s">
          {(spots?.length ?? 0) === 0 && looked.length === 0 && (
            <p className="text-s text-neutral-7">{m.create_alert_hint()}</p>
          )}
          <Button variant="secondary" onClick={onAddSpot}>
            {m.spot_add()}
          </Button>
        </div>
      </PlaceSearch>
    </ViewerDrawer>
  );
}
