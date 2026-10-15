import { ChevronRightIcon } from "@repo/ui/icon";

import type { NearbyBreak } from "@/lib/pages-api";
import { wordsOf } from "@/lib/spot-pages";
import { formatDistance, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { SpotLink, SpotSection } from "./spot-frame";

// The surf breaks near one, as links to their pages: the listed ones first, then the nearest, as
// the API orders them. Decision 057.

/** A line of what a break is like, for a list: its type and its bottom, when known. */
export function breakLine(characteristics: NearbyBreak["characteristics"]) {
  return [
    ...wordsOf("breakTypes", characteristics.breakTypes),
    ...wordsOf("bottomTypes", characteristics.bottomTypes),
  ].join(", ");
}

/** A row of a list of breaks: its name, a line on it, and what the row says on its right. */
export function BreakRow({
  page,
  name,
  line,
  aside,
}: {
  page: string;
  name: string;
  line: string;
  aside?: string;
}) {
  return (
    <li>
      <SpotLink
        page={page}
        className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-m rounded-(--radius-xs) bg-neutral-2 px-m py-s transition-colors duration-(--motion-duration) hover:bg-neutral-3"
      >
        <span className="grid gap-xxs">
          <span className="font-medium">{name}</span>
          {line && <span className="text-s text-neutral-7">{line}</span>}
        </span>
        <span className="flex items-center gap-xs text-s text-neutral-7 tabular-nums">
          {aside}
          <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
        </span>
      </SpotLink>
    </li>
  );
}

/** The breaks within reach of one. Nothing is drawn when none stands near. */
export function NearbyBreaks({ nearby }: { nearby: NearbyBreak[] }) {
  useUnits();
  if (nearby.length === 0) return null;
  return (
    <SpotSection title={m.page_nearby()}>
      <ul className="grid gap-xxs">
        {nearby.map((near) => (
          <BreakRow
            key={near.id}
            page={near.page}
            name={near.name}
            line={breakLine(near.characteristics)}
            aside={m.page_away({ distance: formatDistance(near.distanceKm) })}
          />
        ))}
      </ul>
    </SpotSection>
  );
}
