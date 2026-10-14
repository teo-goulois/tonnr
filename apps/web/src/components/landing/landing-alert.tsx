import { BellFillIcon } from "@repo/ui/icon";
import type { ReactNode } from "react";

import { arcWords, rangeWords } from "@/components/alerts/alert-words";
import type { AlertCriteria } from "@/components/viewer/types";
import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { Card, SectionTitle, Tile, apart, column } from "./landing-parts";

const KNOTS_PER_MS = 1.943844;

// An alert as someone might write it for a beach that faces west. It is said in the words of the
// editor, `AlertEditor`, so that the page reads as the product does.
const EXAMPLE = {
  waveHeightMeters: { min: 1.2, max: 2 },
  wavePeakPeriodSeconds: { min: 10 },
  waveDirectionDegrees: { from: 250, to: 310 },
  windSpeedMetersPerSecond: { max: 12 / KNOTS_PER_MS },
  windDirectionDegrees: { from: 45, to: 135 },
  tideHeightMeters: { min: 2, max: 4 },
} satisfies AlertCriteria;
const SHORTEST_HOURS = 2;
// The green the map gives a sea of a metre and a half: a spot that works.
const WORKS_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 1.5);

// A part its writer sets. The editor underlines it the same way, where it opens what changes it.
function Part({ children }: { children: ReactNode }) {
  return (
    <span className="font-medium text-neutral-10 underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em] transition-[text-decoration-color] duration-(--motion-duration) hover:decoration-neutral-10">
      {children}
    </span>
  );
}

/** What an alert is, shown as the sentence its editor writes. */
export function LandingAlert() {
  return (
    <section className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        title={
          <>
            <Tile color={WORKS_COLOR}>
              <BellFillIcon />
            </Tile>
            {m.landing_alert_title()}
          </>
        }
        more={m.landing_alert_more()}
        className="max-w-4xl"
      />
      <div className="grid gap-l lg:grid-cols-12 lg:gap-x-xl">
        <p className="text-neutral-7 lg:col-span-4 lg:py-xl">{m.landing_alert_note()}</p>
        <Card className="max-lg:row-start-1 lg:col-span-8 lg:p-xl">
          <p className="text-l text-neutral-7">
            {m.alert_says_waves()}{" "}
            <Part>
              {m.alert_height_of({
                range: rangeWords("waveHeightMeters", EXAMPLE.waveHeightMeters),
              })}
            </Part>
            ,{" "}
            <Part>
              {m.alert_period_of({
                range: rangeWords("wavePeakPeriodSeconds", EXAMPLE.wavePeakPeriodSeconds),
              })}
            </Part>
            , <Part>{m.alert_from_sector({ arc: arcWords(EXAMPLE.waveDirectionDegrees) })}</Part>,{" "}
            {m.alert_says_wind()}{" "}
            <Part>
              {m.alert_wind_at({
                range: rangeWords("windSpeedMetersPerSecond", EXAMPLE.windSpeedMetersPerSecond),
              })}
            </Part>
            , <Part>{m.alert_from_sector({ arc: arcWords(EXAMPLE.windDirectionDegrees) })}</Part>,{" "}
            {m.alert_says_tide()}{" "}
            <Part>
              {m.alert_tide_at({ range: rangeWords("tideHeightMeters", EXAMPLE.tideHeightMeters) })}
            </Part>
            , <Part>{m.alert_trend_rising()}</Part>, {m.alert_says_for()}{" "}
            <Part>{m.alert_hours({ count: SHORTEST_HOURS })}</Part>.
          </p>
        </Card>
      </div>
    </section>
  );
}
