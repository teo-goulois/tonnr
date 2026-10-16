import { MenuGroup, MenuGroupLabel, MenuLinkItem } from "@repo/ui/components/ui/menu";

import {
  DIRECTIONS_APPS,
  type Destination,
  type DirectionsApp,
  directionsUrl,
} from "@/lib/directions";
import { m } from "@/paraglide/messages.js";

// An app's name, which its maker gives it in each language.
const APP_NAMES: Record<DirectionsApp, () => string> = {
  apple: m.directions_apple,
  google: () => "Google Maps",
  waze: () => "Waze",
};

/** The map apps one chooses from to go to a surf break or a spot, as a group of its menu. */
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
