import { buttonVariants } from "@repo/ui/components/ui/button";
import { MenuGroup, MenuGroupLabel, MenuLinkItem } from "@repo/ui/components/ui/menu";
import { MapPinIcon } from "@repo/ui/icon";

import {
  DIRECTIONS_APPS,
  type Destination,
  type DirectionsApp,
  directionsUrl,
  mapUrl,
} from "@/lib/directions";
import { m } from "@/paraglide/messages.js";

// An app's name, which its maker gives it in each language.
const APP_NAMES: Record<DirectionsApp, () => string> = {
  apple: m.directions_apple,
  google: () => "Google Maps",
  waze: () => "Waze",
};

/** Opens a surf break or a spot on a wide screen: one link, to Google Maps on the web. */
export function DirectionsActions({ place }: { place: Destination }) {
  return (
    <a
      href={mapUrl(place)}
      target="_blank"
      rel="noreferrer"
      aria-label={m.directions_open_map()}
      className={buttonVariants({ variant: "ghost", size: "icon" })}
    >
      <MapPinIcon data-slot="icon" aria-hidden />
    </a>
  );
}

/** The map apps a phone chooses from to go to a surf break or a spot, as a group of its menu. */
export function DirectionsItems({ place }: { place: Destination }) {
  return (
    <MenuGroup>
      <MenuGroupLabel>{m.directions_choose()}</MenuGroupLabel>
      {DIRECTIONS_APPS.map((app) => (
        <MenuLinkItem key={app} href={directionsUrl(app, place)} target="_blank" rel="noreferrer">
          {APP_NAMES[app]()}
        </MenuLinkItem>
      ))}
    </MenuGroup>
  );
}
