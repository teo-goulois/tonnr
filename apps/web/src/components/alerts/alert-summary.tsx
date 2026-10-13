import { Fragment, type ReactNode } from "react";

import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Alert, AlertCriteria } from "../viewer/types";
import { type Arc, type RangeKey, isSetRange, rangeWords } from "./alert-words";

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
  const range = (key: RangeKey) => {
    const value = criteria[key];
    return isSetRange(value) ? [rangeWords(key, value)] : [];
  };
  // A direction is an arrow and a name: the two ends of the sector, clockwise.
  const sector = (arc: Arc | undefined) =>
    arc
      ? [
          <>
            <Bearing degrees={arc.from} />–<Bearing degrees={arc.to} />
          </>,
        ]
      : [];
  const groups: [string, ReactNode[]][] = [
    [
      m.alert_summary_waves(),
      [
        ...range("waveHeightMeters"),
        ...range("wavePeakPeriodSeconds"),
        ...sector(criteria.waveDirectionDegrees),
      ],
    ],
    [
      m.alert_summary_swell(),
      [...range("primarySwellHeightMeters"), ...sector(criteria.primarySwellDirectionDegrees)],
    ],
    [
      m.alert_summary_wind(),
      [...range("windSpeedMetersPerSecond"), ...sector(criteria.windDirectionDegrees)],
    ],
    [
      m.alert_summary_tide(),
      [
        ...range("tideHeightMeters"),
        ...(criteria.tideTrend
          ? [criteria.tideTrend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling()]
          : []),
      ],
    ],
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
