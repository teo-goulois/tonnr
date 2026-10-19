import { Fragment, type ReactNode } from "react";

import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Alert, AlertCriteria } from "../viewer/types";
import {
  type Arc,
  type Part,
  type RangeKey,
  asksOfTide,
  isSetRange,
  rangeWords,
  tideOf,
  tideWords,
} from "./alert-words";
import { TideTrend } from "./tide-trend";

/**
 * Conditions in a line: the swell, the wind and the tide, each with what is asked of it. What
 * nothing is asked of is left out. `after` is said last, as one more part.
 */
export function ConditionsSummary({
  criteria,
  after,
}: {
  criteria: AlertCriteria;
  after?: ReactNode;
}) {
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  // A part with other values says them all, joined by "or".
  const either = (said: ReactNode[]) =>
    said.length <= 1
      ? said
      : [
          <>
            {said.map((one, at) => (
              // The values of a part keep their order: nothing else tells them apart.
              // oxlint-disable-next-line react/no-array-index-key
              <Fragment key={at}>
                {at > 0 && ` ${m.alert_or_word()} `}
                {one}
              </Fragment>
            ))}
          </>,
        ];
  const range = (key: RangeKey & Part) =>
    either(
      [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((value) =>
        isSetRange(value) ? [rangeWords(key, value)] : [],
      ),
    );
  // A direction is an arrow and a name: the two ends of the sector, clockwise.
  const sector = (
    key: "waveDirectionDegrees" | "primarySwellDirectionDegrees" | "windDirectionDegrees",
  ) =>
    either(
      [criteria[key], ...(criteria.or?.[key] ?? [])].flatMap((arc: Arc | undefined) =>
        arc
          ? [
              <>
                <Bearing degrees={arc.from} />–<Bearing degrees={arc.to} />
              </>,
            ]
          : [],
      ),
    );
  // The tide of an alert written before the cycle says its way with an arrow.
  const tide = either(
    [tideOf(criteria), ...(criteria.or?.tide ?? [])].filter(asksOfTide).map((ask) =>
      ask.tideTrend && !ask.tideCycle && !ask.tideCoefficients ? (
        <>
          {isSetRange(ask.tideHeightMeters) &&
            `${rangeWords("tideHeightMeters", ask.tideHeightMeters)}, `}
          <TideTrend trend={ask.tideTrend} />
        </>
      ) : (
        tideWords(ask)
      ),
    ),
  );
  const groups: [string, ReactNode[]][] = [
    [
      m.alert_summary_waves(),
      [
        ...range("waveHeightMeters"),
        ...range("wavePeakPeriodSeconds"),
        ...sector("waveDirectionDegrees"),
      ],
    ],
    [
      m.alert_summary_swell(),
      [...range("primarySwellHeightMeters"), ...sector("primarySwellDirectionDegrees")],
    ],
    [
      m.alert_summary_wind(),
      [...range("windSpeedMetersPerSecond"), ...sector("windDirectionDegrees")],
    ],
    [m.alert_summary_tide(), tide],
  ];

  const said = groups.filter(([, parts]) => parts.length > 0);
  return (
    <>
      {said.map(([name, parts], at) => (
        <Fragment key={name}>
          {name}{" "}
          {parts.map((part, index) => (
            // The parts of a group keep their order: nothing else tells them apart.
            // oxlint-disable-next-line react/no-array-index-key
            <Fragment key={index}>
              {index > 0 && ", "}
              {part}
            </Fragment>
          ))}
          {(at < said.length - 1 || after !== undefined) && " · "}
        </Fragment>
      ))}
      {after}
    </>
  );
}

/**
 * What an alert asks, in a line: its conditions, then the shortest window.
 */
export function AlertSummary({ alert }: { alert: Pick<Alert, "criteria" | "shortestMinutes"> }) {
  return (
    <ConditionsSummary
      criteria={alert.criteria}
      after={m.alert_summary_shortest({
        hours: m.alert_hours({ count: alert.shortestMinutes / 60 }),
      })}
    />
  );
}
