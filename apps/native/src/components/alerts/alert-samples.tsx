import type { Alert, AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import { useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";

import { AlertRow } from "./alert-row";
import { NoticeRow, NotificationRow } from "./news-rows";
import type { AlertActions } from "./use-alerts";

// The rows of the alerts' tab with invented things told and invented alerts, as the web's design
// system shows its `NoticeRow`: a notification not read with what the nearest buoy measured, read
// ones, the evening before, which lists every alert, a notice of reports read and not read, and
// alerts on, off and paused for today. A press reads a sample, and a switch moves; nothing is
// asked of the API, save by the editor an alert's press opens, which finds no such alert.
// Decisions 031, 068 and 072.

const HOUR_MS = 60 * 60 * 1000;

function notifications(now: number): AlertNotification[] {
  const hour = (offset: number) => new Date(now + offset * HOUR_MS).toISOString();
  return [
    {
      id: "begins",
      alertId: "a1",
      moment: "begins",
      payload: {
        alertName: "Small clean days",
        zone: "Europe/Paris",
        lines: [
          {
            spotId: "s1",
            spotName: "La Gravière",
            open: [{ start: hour(0), end: hour(3) }],
            buoy: {
              stationId: "candhis/anglet",
              name: "Anglet",
              distanceKm: 4.2,
              observedAt: hour(-0.5),
              significantHeightMeters: 1.4,
              peakPeriodSeconds: 11,
              peakDirectionDegrees: 295,
              attribution: "Candhis",
            },
          },
        ],
      },
      readAt: null,
      createdAt: new Date(now - 10 * 60 * 1000),
    },
    {
      id: "evening",
      alertId: null,
      moment: "evening",
      payload: {
        alertName: null,
        zone: "Europe/Paris",
        day: new Date(now + 24 * HOUR_MS).toISOString().slice(0, 10),
        lines: [
          {
            spotId: "s1",
            spotName: "La Gravière",
            alertName: "Small clean days",
            open: [{ start: hour(14), end: hour(17) }],
          },
          {
            spotId: "s2",
            spotName: "Les Estagnots",
            alertName: "Les Estagnots",
            open: [{ start: hour(15), end: hour(18) }],
          },
        ],
      },
      readAt: null,
      createdAt: new Date(now - 3 * HOUR_MS),
    },
    {
      id: "found",
      alertId: "a1",
      moment: "found",
      payload: {
        alertName: "Small clean days",
        zone: "Europe/Paris",
        lines: [
          { spotId: "s1", spotName: "La Gravière", open: [{ start: hour(26), end: hour(29) }] },
        ],
      },
      readAt: new Date(now - 20 * HOUR_MS),
      createdAt: new Date(now - 22 * HOUR_MS),
    },
    {
      id: "gone",
      alertId: "a2",
      moment: "gone",
      payload: {
        alertName: "Big north swell",
        zone: "Europe/Paris",
        lines: [
          {
            spotId: "s3",
            spotName: "Parlementia",
            open: [],
            before: [{ start: hour(40), end: hour(44) }],
          },
        ],
      },
      readAt: new Date(now - 30 * HOUR_MS),
      createdAt: new Date(now - 31 * HOUR_MS),
    },
  ];
}

function notices(now: number): ReportNotice[] {
  return [
    {
      id: "fresh",
      breakId: "b1",
      breakName: "Parlementia",
      createdAt: new Date(now - 30 * 1000),
      updatedAt: new Date(now - 30 * 1000),
      readAt: null,
      told: 2,
      shown: 2,
      state: "shown",
      latest: {
        reportId: "r1",
        author: "teo",
        waveSize: "chest",
        note: "Clean, a few sets",
        thumb: null,
      },
    },
    {
      id: "past",
      breakId: "b2",
      breakName: "La Nord",
      createdAt: new Date(now - 50 * HOUR_MS),
      updatedAt: new Date(now - 50 * HOUR_MS),
      readAt: new Date(now - 49 * HOUR_MS),
      told: 1,
      shown: 0,
      state: "past",
      latest: null,
    },
  ];
}

const place = (spotId: string, name: string) => ({
  spotId,
  breakId: null,
  name,
  latitude: 43.66,
  longitude: -1.44,
});

function alerts(now: number): Alert[] {
  const base = {
    shortestMinutes: 120,
    breakIds: [],
    awayUntil: null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  return [
    {
      ...base,
      id: "a1",
      name: "Small clean days",
      enabled: true,
      criteria: {
        waveHeightMeters: { min: 0.8, max: 1.5 },
        windSpeedMetersPerSecond: { max: 6 },
        windDirectionDegrees: { from: 45, to: 135 },
      },
      spotIds: ["s1", "s2"],
      places: [place("s1", "La Gravière"), place("s2", "Les Estagnots")],
    },
    {
      ...base,
      id: "a2",
      name: "Big north swell",
      enabled: true,
      awayUntil: new Date(now + 6 * HOUR_MS),
      criteria: {
        waveHeightMeters: { min: 2 },
        waveDirectionDegrees: { from: 290, to: 340 },
        tideTrend: "rising",
      },
      spotIds: ["s3"],
      places: [place("s3", "Parlementia")],
    },
    {
      ...base,
      id: "a3",
      name: "Evening glass",
      enabled: false,
      criteria: { windSpeedMetersPerSecond: { max: 3 } },
      spotIds: ["s1"],
      places: [place("s1", "La Gravière")],
    },
  ];
}

export function AlertSamples() {
  const { space } = useTheme();
  const [now] = useState(() => Date.now());
  const [told, setTold] = useState(() => notifications(now));
  const [reports, setReports] = useState(() => notices(now));
  const [mine, setMine] = useState(() => alerts(now));

  const readTold = (id: string) =>
    setTold((all) => all.map((one) => (one.id === id ? { ...one, readAt: new Date() } : one)));
  const readReport = (id: string) =>
    setReports((all) => all.map((one) => (one.id === id ? { ...one, readAt: new Date() } : one)));
  const actions: AlertActions = {
    switching: [],
    flip: (alert, enabled) =>
      setMine((all) => all.map((one) => (one.id === alert.id ? { ...one, enabled } : one))),
    pausing: false,
    pause: async () => {},
    resume: async () => {},
    remove: () => {},
    duplicate: () => {},
    open: () => {},
  };

  return (
    <View style={{ gap: space.m }}>
      <Text size="s" tone="muted">
        Notifications
      </Text>
      <View style={{ gap: space.xxs, marginHorizontal: -space.xs }}>
        {told.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            now={now}
            onRead={() => readTold(notification.id)}
          />
        ))}
        {reports.map((notice) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            now={now}
            onRead={() => readReport(notice.id)}
            onOpen={() => readReport(notice.id)}
          />
        ))}
      </View>
      <Text size="s" tone="muted">
        My alerts
      </Text>
      <View style={{ gap: space.xxs, marginHorizontal: -space.xs }}>
        {mine.map((alert) => (
          <AlertRow key={alert.id} alert={alert} actions={actions} plain />
        ))}
      </View>
    </View>
  );
}
