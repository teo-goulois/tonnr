import { m } from "@/paraglide/messages.js";

import { SECTIONS, SectionTitle, apart, column, ruled } from "./landing-parts";

type Row = { name: () => string; text: () => string };

// Everything the product does, one line each, in the order someone meets it: what anyone reads,
// what an account keeps, what accounts write together, and what the project lets anyone do.
const GROUPS: { title: () => string; rows: Row[] }[] = [
  {
    title: m.landing_sea_title,
    rows: [
      { name: m.landing_sea_map_name, text: m.landing_sea_map_text },
      { name: m.landing_sea_buoys_name, text: m.landing_sea_buoys_text },
      { name: m.landing_sea_wind_name, text: m.landing_sea_wind_text },
      { name: m.landing_sea_forecasts_name, text: m.landing_sea_forecasts_text },
      { name: m.landing_sea_tides_name, text: m.landing_sea_tides_text },
      { name: m.landing_sea_breaks_name, text: m.landing_sea_breaks_text },
      { name: m.landing_sea_search_name, text: m.landing_sea_search_text },
    ],
  },
  {
    title: m.landing_spots_title,
    rows: [
      { name: m.landing_spots_spots_name, text: m.landing_spots_spots_text },
      { name: m.landing_spots_alerts_name, text: m.landing_spots_alerts_text },
      { name: m.landing_spots_sessions_name, text: m.landing_spots_sessions_text },
      { name: m.landing_spots_lists_name, text: m.landing_spots_lists_text },
    ],
  },
  {
    title: m.landing_community_title,
    rows: [
      { name: m.landing_community_guides_name, text: m.landing_community_guides_text },
      { name: m.landing_community_ranks_name, text: m.landing_community_ranks_text },
      { name: m.landing_community_friends_name, text: m.landing_community_friends_text },
    ],
  },
  {
    title: m.landing_open_title,
    rows: [
      { name: m.landing_open_free_name, text: m.landing_open_free_text },
      { name: m.landing_open_source_name, text: m.landing_open_source_text },
      { name: m.landing_open_data_name, text: m.landing_open_data_text },
      { name: m.landing_open_details_name, text: m.landing_open_details_text },
    ],
  },
];

/** What the product does, as a list someone reads down. */
export function LandingFeatures() {
  return (
    <section
      aria-labelledby={SECTIONS.features}
      className={`${column} ${apart} grid scroll-mt-l gap-xl lg:gap-xxl`}
    >
      <SectionTitle
        id={SECTIONS.features}
        title={m.landing_features_title()}
        more={m.landing_features_more()}
        className="max-w-4xl scroll-mt-xl"
      />
      <div className="grid gap-xl lg:gap-xxl">
        {GROUPS.map((group) => (
          <div key={group.title()} className="grid gap-s lg:grid-cols-12 lg:gap-x-xl">
            {/* The name of a group stays in view while its rows pass. */}
            <h3 className="font-medium max-lg:text-l lg:sticky lg:top-l lg:col-span-4 lg:self-start lg:py-m">
              {group.title()}
            </h3>
            <dl className="lg:col-span-8">
              {group.rows.map((row) => (
                <div
                  key={row.name()}
                  className={`${ruled} grid gap-xxs py-m sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-l`}
                >
                  <dt className="font-medium">{row.name()}</dt>
                  <dd className="text-neutral-7">{row.text()}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
