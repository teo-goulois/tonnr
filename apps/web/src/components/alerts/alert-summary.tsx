import { Fragment, type ReactNode } from "react";

import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { Bearing } from "../viewer/bearing";
import type { Alert } from "../viewer/types";
import { type Arc, type RangeKey, isSetRange, rangeWords } from "./alert-words";

/**
 * What an alert asks, in a line: the swell, the wind and the tide, each with what is asked of
 * it, then the shortest window. What it asks nothing of is left out.
 */
export function AlertSummary({ alert }: { alert: Pick<Alert, "criteria" | "shortestMinutes"> }) {
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const { criteria } = alert;
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

  return (
    <>
      {groups
        .filter(([, parts]) => parts.length > 0)
        .map(([name, parts]) => (
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
            {" · "}
          </Fragment>
        ))}
      {m.alert_summary_shortest({ hours: m.alert_hours({ count: alert.shortestMinutes / 60 }) })}
    </>
  );
}
