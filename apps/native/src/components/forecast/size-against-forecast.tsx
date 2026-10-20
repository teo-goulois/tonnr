import type { Forecast, SizeFactor } from "@repo/client/viewer/types";
import { type PeriodBand, SWELL_SECTORS, factorFor } from "@repo/conditions/sessions/size-factor";
import type { ReactNode } from "react";

import { Text } from "@/components/ui/text";
import { compassName, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { DirectionArrow } from "./bearing";
import { hourNear, saidOf } from "./size-against";

// How big the waves of a break run against the forecast, in one sentence of grey prose under
// the tiles: what the sessions surfed there say, by the swell of the hour when enough of them
// were in it, then what the people who surf it wrote in its guide. Each is an estimate and says
// where it comes from, and nothing is drawn when neither says anything. Decision 062. The web's
// `size-against-forecast.tsx`.

const PERIODS: Record<PeriodBand, () => string> = {
  short: m.size_period_short,
  medium: m.size_period_medium,
  long: m.size_period_long,
};

/** A sentence with one of its parts in the darker type. */
function Emphasized({ text, part }: { text: string; part: string }) {
  const { colors } = useTheme();
  const at = part ? text.indexOf(part) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text size="s" style={{ color: colors["neutral-10"] }}>
        {part}
      </Text>
      {text.slice(at + part.length)}
    </>
  );
}

export function SizeAgainstForecast({
  learned,
  locals,
  hours,
  now,
}: {
  // What the sessions say. Undefined while it is on its way.
  learned: SizeFactor | undefined;
  // What the guide's line says: the steps it holds.
  locals: readonly string[] | null | undefined;
  hours: Forecast["hours"] | undefined;
  now: number;
}) {
  const { colors, space } = useTheme();
  const hour = hourNear(hours, now);
  const of =
    learned &&
    factorFor(learned, {
      waveDirectionDegrees: hour?.waveDirectionDegrees ?? null,
      wavePeakPeriodSeconds: hour?.wavePeakPeriodSeconds ?? null,
    });
  const said = saidOf(locals);
  if (!of && !said) return null;

  const factor = of ? formatNumber(of.factor, 1) : "";
  const parts: ReactNode[] = [];
  if (of) {
    parts.push(
      of.swell ? (
        <Text key="swell" size="s" tone="muted">
          {m.size_against_swell_before()}{" "}
          <Text size="s" style={{ color: colors["neutral-10"] }}>
            <DirectionArrow
              fromDegrees={SWELL_SECTORS.indexOf(of.swell.sector) * 45}
              size={13}
              color={colors["neutral-10"]}
            />{" "}
            {compassName(SWELL_SECTORS.indexOf(of.swell.sector) * 45)}
          </Text>{" "}
          <Emphasized
            text={m.size_against_swell_after({
              period: PERIODS[of.swell.period](),
              factor,
              count: of.sessions,
            })}
            part={factor}
          />
        </Text>
      ) : (
        <Emphasized
          key="learned"
          text={m.size_against_learned({ factor, count: of.sessions })}
          part={factor}
        />
      ),
    );
  }
  if (said) {
    if (of) parts.push(" ");
    parts.push(<Emphasized key="locals" text={m.size_against_locals({ said })} part={said} />);
    if (!of) parts.push(` ${m.size_against_guide_note()}`);
  }

  return (
    <Text size="s" tone="muted" style={{ paddingHorizontal: space.xs }}>
      {parts}
    </Text>
  );
}
