import { APP_NAME } from "@repo/config/app";

import { formatSeconds } from "@/lib/format";
import { formatDistance, formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import {
  EnergyDemo,
  FetchDemo,
  LIGHT_WIND_KNOTS,
  NeighboursDemo,
  WeekDemo,
  WindSeaDemo,
} from "./demos-intermediate";
import { GuidePage } from "./guide-page";

// The intermediate guide: for a reader who surfs and wants to choose their day. Decision 060.
export function IntermediateGuide() {
  useUnits();
  return (
    <GuidePage
      level="intermediate"
      next="advanced"
      lessons={[
        {
          id: "swell-and-wind-sea",
          paragraphs: [
            m.learn_i_windsea_p1(),
            m.learn_i_windsea_p2({
              name: APP_NAME,
              total: formatHeight(2),
              swell: formatHeight(1),
            }),
            m.learn_i_windsea_p3(),
          ],
          demo: <WindSeaDemo />,
          keep: m.learn_i_windsea_keep(),
        },
        {
          id: "energy",
          paragraphs: [
            m.learn_i_energy_p1(),
            m.learn_i_energy_p2({
              low: formatHeight(1),
              lowPeriod: formatSeconds(14),
              high: formatHeight(2),
              highPeriod: formatSeconds(7),
            }),
            m.learn_i_energy_p3(),
          ],
          demo: <EnergyDemo />,
          keep: m.learn_i_energy_keep(),
        },
        {
          id: "fetch",
          paragraphs: [
            m.learn_i_fetch_p1(),
            m.learn_i_fetch_p2({ period: formatSeconds(15), distance: formatDistance(1000) }),
            m.learn_i_fetch_p3(),
          ],
          demo: <FetchDemo />,
          keep: m.learn_i_fetch_keep(),
        },
        {
          id: "week",
          paragraphs: [
            m.learn_i_week_p1(),
            m.learn_i_week_p2({ wind: formatWind(LIGHT_WIND_KNOTS) }),
            m.learn_i_week_p3({ name: APP_NAME }),
          ],
          demo: <WeekDemo />,
          keep: m.learn_i_week_keep(),
        },
        {
          id: "neighbours",
          paragraphs: [
            m.learn_i_neighbours_p1({ distance: formatDistance(5) }),
            m.learn_i_neighbours_p2(),
            m.learn_i_neighbours_p3(),
          ],
          demo: <NeighboursDemo />,
          keep: m.learn_i_neighbours_keep(),
        },
      ]}
    />
  );
}
