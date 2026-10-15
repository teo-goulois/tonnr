import { RocketFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";

import { WIND_SPEED_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { IdeaDialog } from "./landing-idea";

import {
  SECTIONS,
  SectionTitle,
  Tile,
  Woven,
  apart,
  arrive,
  column,
  order,
  ruled,
  under,
  useArriving,
} from "./landing-parts";

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
  const arriving = useArriving<HTMLElement>();
  return (
    <section
      {...arriving}
      aria-labelledby={SECTIONS.next}
      className={`${column} ${apart} ${under} group/arrival grid`}
    >
      <SectionTitle
        id={SECTIONS.next}
        title={
          <Woven
            say={m.landing_next_title}
            words={{
              next: (
                <>
                  <Tile color={NEXT_COLOR}>
                    <RocketFillDuoIcon />
                  </Tile>
                  {m.landing_next_word()}
                </>
              ),
            }}
          />
        }
        more={m.landing_next_more()}
        className={cn(arrive, "max-w-4xl scroll-mt-[calc(var(--space-xxl)*2)]")}
      />
      <ul className="grid gap-x-xl sm:grid-cols-2 lg:grid-cols-4">
        {IDEAS.map((idea, index) => (
          <li
            key={idea.name()}
            style={order(1 + index)}
            className={cn(arrive, ruled, "grid grid-rows-[auto_auto_1fr] gap-xxs py-m")}
          >
            <h3 className="font-medium">{idea.name()}</h3>
            <p className="text-neutral-7">{idea.text()}</p>
            {/* The reader says it is the one they wait for, by the same mail as an idea. */}
            <div className="mt-xs self-end">
              <IdeaDialog wants={idea.name()} />
            </div>
          </li>
        ))}
        {/* The reader's own, which reaches its maker by mail. */}
        <li
          style={order(1 + IDEAS.length)}
          className={cn(arrive, ruled, "grid grid-rows-[auto_auto_1fr] gap-xxs py-m")}
        >
          <h3 className="font-medium">{m.landing_next_yours_name()}</h3>
          <p className="text-neutral-7">{m.landing_next_yours_text()}</p>
          <div className="mt-xs self-end">
            <IdeaDialog />
          </div>
        </li>
      </ul>
    </section>
  );
}
