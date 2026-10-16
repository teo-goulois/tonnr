import { HeightDemo, SwellDemo } from "@/components/learn/demos-beginner";
import { WeekDemo } from "@/components/learn/demos-intermediate";
import { Prose } from "@/components/learn/prose";
import { Term } from "@/components/learn/term";
import { UnitTabs } from "@/components/shared/units-settings";

// The pieces of the guides that teach how to read a forecast: a paragraph with its technical
// words, which open the glossary, the choice of a unit beside a figure, and demos of each level.
// Decision 060.

export function LearnSamples() {
  return (
    <div className="grid gap-m">
      <Prose text="The height announced is that of the [swell](swell) **out at sea**, measured by a [buoy](buoy). A word whose id is no term, [like this](nothing), stays as it is." />
      <p className="text-neutral-7">
        A term on its own: <Term id="offshore">offshore</Term>.
      </p>
      <div className="flex flex-wrap items-center gap-m">
        <UnitTabs measure="height" />
        <UnitTabs measure="windSpeed" />
      </div>
      <div className="grid gap-m lg:grid-cols-3">
        <HeightDemo />
        <SwellDemo />
        <WeekDemo />
      </div>
    </div>
  );
}
