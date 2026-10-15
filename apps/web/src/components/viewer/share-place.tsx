import { APP_NAME } from "@repo/config/app";
import { Button } from "@repo/ui/components/ui/button";
import { ShareIcon } from "@repo/ui/icon";
import { toast } from "sonner";

import { m } from "@/paraglide/messages.js";
import { localizeHref } from "@/paraglide/runtime.js";

/** What a link may open: a surf break of the catalogue or a station, which anyone reads. */
export type SharedPlace = { breakId: string } | { stationId: string };

/** The short address of a break or a station, which opens the map on its panel. */
export function placeLink(place: SharedPlace) {
  const path = "breakId" in place ? `/b/${place.breakId}` : `/s/${place.stationId}`;
  return new URL(localizeHref(path), window.location.origin).href;
}

/**
 * Sends a surf break or a station to someone: a phone hands its short address to its own sheet,
 * and a browser that has none copies it.
 */
export function SharePlace({ place, name }: { place: SharedPlace; name: string }) {
  async function share() {
    const url = placeLink(place);
    if (typeof navigator.share === "function") {
      // Whoever closes the sheet without sending has done nothing wrong.
      await navigator
        .share({ title: name, text: m.place_share_text({ name, app: APP_NAME }), url })
        .catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(m.share_copied());
    } catch {
      toast.error(m.place_link_copy_failed());
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={m.share_action_of({ name })}
      onClick={() => void share()}
    >
      <ShareIcon data-slot="icon" aria-hidden />
    </Button>
  );
}
