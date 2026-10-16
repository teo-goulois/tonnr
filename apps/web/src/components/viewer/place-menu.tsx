import { Button } from "@repo/ui/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@repo/ui/components/ui/menu";
import { MoreHorizontalIcon } from "@repo/ui/icon";

import type { Destination } from "@/lib/directions";
import { m } from "@/paraglide/messages.js";

import { DirectionsItems } from "./directions-actions";
import { type SharedPlace, sharePlace } from "./share-place";

/**
 * What is done with the place of a panel, in one menu, since it is seldom done: begin an alert
 * there, share it, and go there with a map app.
 */
export function PlaceMenu({
  name,
  onAlert,
  share,
  directions,
}: {
  name: string;
  onAlert?: () => void;
  share?: SharedPlace;
  directions?: Destination;
}) {
  if (!onAlert && !share && !directions) return null;
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={m.spot_menu({ name })} />}
      >
        <MoreHorizontalIcon data-slot="icon" aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        {onAlert && <MenuItem onClick={onAlert}>{m.alert_create()}</MenuItem>}
        {share && (
          <MenuItem onClick={() => void sharePlace(share, name)}>{m.place_share()}</MenuItem>
        )}
        {directions && (
          <>
            {(onAlert || share) && <MenuSeparator />}
            <DirectionsItems place={directions} />
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
