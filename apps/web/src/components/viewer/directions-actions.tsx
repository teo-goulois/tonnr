import { Button, buttonVariants } from "@repo/ui/components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPopup,
  MenuTrigger,
} from "@repo/ui/components/ui/menu";
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

/**
 * Opens a surf break or a spot in a map app. A wide screen gets one link, to Google Maps on the
 * web. A phone, which is under `lg`, chooses the app that leads there, as AppShell chooses its bar
 * with CSS, since the server knows no width.
 */
export function DirectionsActions({ place }: { place: Destination }) {
  return (
    <>
      <a
        href={mapUrl(place)}
        target="_blank"
        rel="noreferrer"
        aria-label={m.directions_open_map()}
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "max-lg:hidden",
        })}
      >
        <MapPinIcon data-slot="icon" aria-hidden />
      </a>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={m.directions_get()}
            />
          }
        >
          <MapPinIcon data-slot="icon" aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-48">
          <MenuGroup>
            <MenuGroupLabel>{m.directions_choose()}</MenuGroupLabel>
            {DIRECTIONS_APPS.map((app) => (
              <MenuLinkItem
                key={app}
                href={directionsUrl(app, place)}
                target="_blank"
                rel="noreferrer"
              >
                {APP_NAMES[app]()}
              </MenuLinkItem>
            ))}
          </MenuGroup>
        </MenuPopup>
      </Menu>
    </>
  );
}
