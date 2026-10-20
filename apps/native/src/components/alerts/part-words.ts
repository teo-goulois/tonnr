import { isArcPart, tideAt, valueAt } from "@repo/client/alerts/editing";
import type { AlertCriteria } from "@repo/client/viewer/types";

import { compassName } from "@/lib/format";
import { m } from "@/paraglide/messages";

import type { PartKey } from "./bridge";
import {
  type Arc,
  CRITERION_LABELS,
  type Part,
  type Range,
  type RangeKey,
  arcWords,
  asksOfTide,
  bearingWords,
  isSetRange,
  rangeWords,
  tideWords,
} from "./words";

// What each part of an alert's sentence says, as the web's editor writes it: its own value with
// the verb before it, "are 1–2 m", an other value alone, "3 m or more", and what a part says that
// asks nothing, "of any size". A direction is an arrow and the point it comes from, which a
// screen reader is given in words. Decision 031, "The editor".

type RangePart = RangeKey & Exclude<Part, "tide">;

const ANY: Partial<Record<Part, () => string>> = {
  waveHeightMeters: m.alert_any_height,
  wavePeakPeriodSeconds: m.alert_any_period,
  primarySwellHeightMeters: m.alert_any_swell_height,
  windSpeedMetersPerSecond: m.alert_any_wind,
};

const SAID: Partial<Record<Part, (range: string) => string>> = {
  waveHeightMeters: (range) => m.alert_height_of({ range }),
  wavePeakPeriodSeconds: (range) => m.alert_period_of({ range }),
  primarySwellHeightMeters: (range) => m.alert_swell_height_of({ range }),
  windSpeedMetersPerSecond: (range) => m.alert_wind_at({ range }),
};

/** The name of a part, for its sheet and for a screen reader. */
export function partLabel(key: PartKey) {
  if (key === "shortest") return m.alert_label_shortest();
  return key === "tide" ? m.alert_label_tide() : CRITERION_LABELS[key]();
}

/** A sector in words, with its arrows, and the same for a screen reader. */
export function sectorWords(arc: Arc) {
  return {
    shown: `${bearingWords(arc.from)}–${bearingWords(arc.to)}`,
    spoken: `${compassName(arc.from)} – ${compassName(arc.to)}`,
  };
}

export type PartSaid = {
  /** What the sentence says. */
  words: string;
  /** The same, for a screen reader, when the sentence writes an arrow. */
  spoken?: string;
  /** The value alone, as a part's sheet says it big: "1–2 m", or "Any". */
  value: string;
  isSet: boolean;
};

/** What a value of a part says. */
export function partSaid(criteria: AlertCriteria, key: Part, index: number): PartSaid {
  const toChoose = m.alert_to_choose();
  if (key === "tide") {
    const ask = tideAt(criteria, index);
    const isSet = asksOfTide(ask);
    const words = isSet ? tideWords(ask) : index === 0 ? m.alert_any_tide_moment() : toChoose;
    return { words, value: isSet ? words : m.alert_part_any(), isSet };
  }
  const value = valueAt(criteria, key, index);
  if (isArcPart(key)) {
    const arc = value as Arc | undefined;
    if (!arc) {
      return {
        words: index === 0 ? m.alert_any_from() : toChoose,
        value: m.alert_part_any(),
        isSet: false,
      };
    }
    const sector = sectorWords(arc);
    return {
      words: `${m.alert_from()} ${sector.shown}`,
      spoken: m.alert_from_sector({ arc: sector.spoken }),
      value: m.alert_sector_degrees({
        arc: arcWords(arc),
        from: String(arc.from),
        to: String(arc.to),
      }),
      isSet: true,
    };
  }
  const range = value as Range | undefined;
  if (!isSetRange(range)) {
    return {
      words: index === 0 ? (ANY[key]?.() ?? toChoose) : toChoose,
      value: m.alert_part_any(),
      isSet: false,
    };
  }
  const said = rangeWords(key as RangePart, range);
  return { words: index === 0 ? (SAID[key]?.(said) ?? said) : said, value: said, isSet: true };
}
