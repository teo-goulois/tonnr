import { ArrowUpIcon } from "@repo/ui/icon";

import { WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { SECTIONS, SectionTitle, Tile, apart, column, ruled } from "./landing-parts";

// The orange of a wind that rises, for what is still to come.
const NEXT_COLOR = scaleColor(WIND_SPEED_SCALE, 25);

// What its maker thinks of doing next. `docs/product-vision.md` holds the same ideas: one that is
// done leaves this list for the features, and one that is dropped leaves both.
const IDEAS = [
  { name: m.landing_next_mobile_name, text: m.landing_next_mobile_text },
  { name: m.landing_next_data_name, text: m.landing_next_data_text },
  { name: m.landing_next_tides_name, text: m.landing_next_tides_text },
];

/** What may come next, said as ideas and not as promises. */
export function LandingNext() {
  return (
    <section aria-labelledby={SECTIONS.next} className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        id={SECTIONS.next}
        title={
          <>
            <Tile color={NEXT_COLOR}>
              <ArrowUpIcon />
            </Tile>
            {m.landing_next_title()}
          </>
        }
        more={m.landing_next_more()}
        className="max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]"
      />
      <ul className="grid gap-x-xl sm:grid-cols-3">
        {IDEAS.map((idea) => (
          <li key={idea.name()} className={`${ruled} grid content-start gap-xxs py-m`}>
            <h3 className="font-medium">{idea.name()}</h3>
            <p className="text-neutral-7">{idea.text()}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
