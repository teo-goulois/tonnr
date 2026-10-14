import { m } from "@/paraglide/messages.js";

const linked = "focus-ring rounded-xs underline underline-offset-2 hover:text-neutral-10";

/**
 * A point, and where to look at it from above: OpenStreetMap, and the aerial photographs of
 * Google Maps, which this app does not draw.
 */
export function PlaceLinks({ point }: { point: { latitude: number; longitude: number } }) {
  const { latitude, longitude } = point;
  return (
    <p className="flex flex-wrap gap-x-s gap-y-xxs text-s text-neutral-7">
      <span className="tabular-nums">
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </span>
      <a
        className={linked}
        target="_blank"
        rel="noreferrer"
        href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
      >
        {m.catalogue_open_osm()}
      </a>
      <a
        className={linked}
        target="_blank"
        rel="noreferrer"
        href={`https://www.google.com/maps/@?api=1&map_action=map&center=${latitude},${longitude}&zoom=17&basemap=satellite`}
      >
        {m.catalogue_open_aerial()}
      </a>
    </p>
  );
}
