import { BellOnFillDuoIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { type Arc, rangeWords } from "@/components/alerts/alert-words";
import { TideTrend } from "@/components/alerts/tide-trend";
import { Bearing } from "@/components/viewer/bearing";
import type { AlertCriteria } from "@/components/viewer/types";
import { WAVE_HEIGHT_SCALE, scaleColor } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { AppName, Card, SectionTitle, Tile, Woven, apart, column } from "./landing-parts";

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
  tideTrend: "rising",
} satisfies AlertCriteria;
const SHORTEST_HOURS = 2;
// The green the map gives a sea of a metre and a half: a spot that works.
const WORKS_COLOR = scaleColor(WAVE_HEIGHT_SCALE, 1.5);

// How the editor underlines a part its writer sets, where it opens what changes it. A direction
// carries its own line, which an arrow interrupts, and draws it darker when its part is pointed at.
const underlined =
  "underline decoration-neutral-5 decoration-dotted decoration-1 underline-offset-[0.25em] transition-[text-decoration-color] duration-(--motion-duration) group-hover/part:decoration-neutral-10";

function Part({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("group/part font-medium text-neutral-10", underlined, className)}>
      {children}
    </span>
  );
}

// A sector, as the editor shows it: an arrow and a name for each of its ends, clockwise, on one
// line.
function Sector({ arc }: { arc: Arc }) {
  return (
    <Part className="whitespace-nowrap">
      {m.alert_from()} <Bearing degrees={arc.from} className={underlined} />–
      <Bearing degrees={arc.to} className={underlined} />
    </Part>
  );
}

/** What an alert is, shown as the sentence its editor writes. */
export function LandingAlert() {
  return (
    <section className={`${column} ${apart} grid gap-xl`}>
      <SectionTitle
        title={
          <Woven
            say={m.landing_alert_title}
            words={{
              alert: (
                <>
                  <Tile color={WORKS_COLOR}>
                    <BellOnFillDuoIcon />
                  </Tile>
                  {m.landing_alert_word()}
                </>
              ),
            }}
          />
        }
        more={<Woven say={m.landing_alert_more} words={{ name: <AppName /> }} />}
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
            , <Sector arc={EXAMPLE.waveDirectionDegrees} />, {m.alert_says_wind()}{" "}
            <Part>
              {m.alert_wind_at({
                range: rangeWords("windSpeedMetersPerSecond", EXAMPLE.windSpeedMetersPerSecond),
              })}
            </Part>
            , <Sector arc={EXAMPLE.windDirectionDegrees} />, {m.alert_says_tide()}{" "}
            <Part>
              {m.alert_tide_at({ range: rangeWords("tideHeightMeters", EXAMPLE.tideHeightMeters) })}
            </Part>
            ,{" "}
            <Part>
              <TideTrend trend={EXAMPLE.tideTrend} className={underlined} />
            </Part>
            , {m.alert_says_for()} <Part>{m.alert_hours({ count: SHORTEST_HOURS })}</Part>.
          </p>
        </Card>
      </div>
    </section>
  );
}
