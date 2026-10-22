import { WIND_SPEED_SCALE } from "@repo/client/sea-scales";
import type { Forecast, Loadable, Reading, Station } from "@repo/client/viewer/types";
import {
  HISTORY_DAYS,
  WIND_RANGES,
  type WindRangeKey,
  aheadOf,
  windRows,
  windSummary,
  withModel,
} from "@repo/client/viewer/wind";
import { type ReactNode, useMemo, useState } from "react";
import { View } from "react-native";

import { WindChart } from "@/components/charts/wind-chart";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatDayAndClock, formatNumber, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatWind, useUnits, windFigure, windUnit } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { Bearing } from "./bearing";
import { Block } from "./block";
import { HOUR_MS, colorAt, measuredSamples, modelSamples, nightsBetween } from "./metrics";

// The panel of a station that measures the wind alone, as the web's `WindDetails` draws it: what
// it reads now, then its wind and its gusts over the last hours or days, with the model's wind
// as a dashed line that goes on past now. Nothing of the sea is written there, and no tide.

/** One figure of the wind now, on its tile. */
function Tile({
  label,
  aside,
  figure,
  unit,
  color,
  said,
  isLoading,
}: {
  label: string;
  aside?: ReactNode;
  figure: ReactNode | undefined;
  unit?: string;
  // The color of the figure on the wind's scale. A tile without one draws no bar.
  color?: string;
  // What a screen reader hears of the tile.
  said: string;
  isLoading: boolean;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={isLoading ? label : said}
      accessibilityState={{ busy: isLoading }}
      style={{
        flex: 1,
        minWidth: 0,
        gap: space.xxs,
        padding: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: colors["neutral-2"],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.xxs,
        }}
      >
        <Text size="xs" tone="muted" numberOfLines={1} dense style={{ flexShrink: 1 }}>
          {label}
        </Text>
        {!isLoading && aside}
      </View>
      {isLoading ? (
        <Skeleton height={31} width={40} />
      ) : typeof figure === "string" || figure === undefined ? (
        // The figure keeps the size of its type and ends in an ellipsis where the tile is too
        // narrow, as the web's does. Its unit stays on its line, a space after it.
        <Text size="l" weight="medium" numeric dense numberOfLines={1}>
          {figure ?? "–"}
          {figure !== undefined && unit ? <Text size="xs" tone="muted">{` ${unit}`}</Text> : null}
        </Text>
      ) : (
        <View style={{ minHeight: 31, justifyContent: "center" }}>{figure}</View>
      )}
      {color !== undefined && (
        <View
          style={{
            width: 24,
            height: 4,
            borderRadius: 2,
            backgroundColor: isLoading ? colors["neutral-4"] : color,
          }}
        />
      )}
    </View>
  );
}

type WindDetailsProps = {
  now: number;
  station?: Pick<Station, "latitude" | "longitude">;
  // The station's readings, newest first.
  readings?: Reading[];
  latest?: Reading | null;
  historyPending: boolean;
  // How many days of readings the panel was given. It asks for a week when a week is chosen.
  historyDays?: number;
  onHistoryExtend?: () => void;
  // The model's wind at the station, drawn beside what it measured and past now.
  forecast: Loadable<Forecast>;
  footer: ReactNode;
  // Where what a phone's sheet shows before it is raised ends, from the top of the panel.
  onFold?: (bottom: number) => void;
};

export function WindDetails({
  now,
  station,
  readings,
  latest,
  historyPending,
  historyDays = HISTORY_DAYS,
  onHistoryExtend,
  forecast,
  footer,
  onFold,
}: WindDetailsProps) {
  // Drawn again when the reader changes units: every figure here is a wind speed.
  useUnits();
  const { colors, space } = useTheme();
  const [key, setKey] = useState<WindRangeKey>("day");
  const range = WIND_RANGES[key];
  const start = now - range.span;
  const end = now + aheadOf(range);

  const samples = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = forecast.data?.hours;
  const model = useMemo(() => modelSamples(hours ?? []), [hours]);
  const measured = useMemo(
    () => windRows(samples, start, now, range.step),
    [samples, start, now, range.step],
  );
  const rows = useMemo(() => withModel(measured, model, start, end), [measured, model, start, end]);
  const summary = useMemo(() => windSummary(measured), [measured]);
  const nights = useMemo(
    () => (station ? nightsBetween(start, end, station.latitude, station.longitude) : []),
    // The nights move with the hours, not with the minutes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [station?.latitude, station?.longitude, Math.floor(start / HOUR_MS), end - start],
  );

  const wind = toKnots(latest?.windSpeedMetersPerSecond);
  const gust = toKnots(latest?.windGustMetersPerSecond);
  const bearing = latest?.windDirectionDegrees ?? null;
  const isReading = historyPending && !latest;
  // A span longer than the days in hand waits for them.
  const isChartLoading = (historyPending && !readings) || range.days > historyDays;
  const ranges: { value: WindRangeKey; label: string }[] = [
    { value: "hours", label: `6 ${m.details_hours_short()}` },
    { value: "day", label: `24 ${m.details_hours_short()}` },
    { value: "days", label: `48 ${m.details_hours_short()}` },
    // A week is offered only where the panel can ask for its days.
    ...(onHistoryExtend || WIND_RANGES.week.days <= historyDays
      ? [{ value: "week" as const, label: `7 ${m.details_days_short()}` }]
      : []),
  ];

  return (
    <View style={{ gap: space.l }}>
      {/* What a phone's sheet shows before it is raised. */}
      <View
        style={{ flexDirection: "row", gap: space.xs }}
        onLayout={(event) => onFold?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
      >
        <Tile
          label={m.details_wind()}
          figure={wind === null ? undefined : windFigure(wind)}
          unit={windUnit()}
          color={wind === null ? colors["neutral-4"] : colorAt(WIND_SPEED_SCALE, wind)}
          said={`${m.details_wind()}, ${wind === null ? "–" : formatWind(wind)}`}
          isLoading={isReading}
        />
        <Tile
          label={m.details_gusts()}
          figure={gust === null ? undefined : windFigure(gust)}
          unit={windUnit()}
          color={gust === null ? colors["neutral-4"] : colorAt(WIND_SPEED_SCALE, gust)}
          said={`${m.details_gusts()}, ${gust === null ? "–" : formatWind(gust)}`}
          isLoading={isReading}
        />
        <Tile
          label={m.details_direction()}
          aside={
            bearing !== null && (
              <Text size="xs" tone="muted" numeric dense>
                {`${formatNumber(bearing, 0)}°`}
              </Text>
            )
          }
          // In the tile's figure, as large as the wind's and the gusts', with an arrow at the size
          // of its type, as the web writes it.
          figure={
            bearing === null ? undefined : (
              <Bearing degrees={bearing} size="l" weight="medium" arrow={20} dense />
            )
          }
          said={
            bearing === null
              ? `${m.details_direction()}, –`
              : `${m.details_direction()}, ${m.alert_from()} ${compassName(bearing)}, ${formatNumber(bearing, 0)}°`
          }
          isLoading={isReading}
        />
      </View>

      <Block
        title={m.details_measurements()}
        control={
          <Segmented
            label={m.details_measurements()}
            options={ranges}
            value={key}
            onChange={(next) => {
              setKey(next);
              if (WIND_RANGES[next].days > historyDays) onHistoryExtend?.();
            }}
          />
        }
      >
        <WindChart
          rows={rows}
          start={start}
          end={end}
          now={now}
          nights={nights}
          isLoading={isChartLoading}
        />
        {!isChartLoading && summary.mean !== undefined && (
          <View style={{ gap: space.xxs }}>
            <View
              accessible
              style={{ flexDirection: "row", justifyContent: "space-between", gap: space.xs }}
            >
              <Text size="xs" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {m.details_wind_mean()}
              </Text>
              <Text size="xs" numeric>
                {formatWind(summary.mean)}
              </Text>
            </View>
            {summary.strongest && (
              <View
                accessible
                style={{ flexDirection: "row", justifyContent: "space-between", gap: space.xs }}
              >
                <Text size="xs" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {m.details_gust_max()}
                </Text>
                <Text size="xs" numeric>
                  {formatWind(summary.strongest.value)}
                  <Text size="xs" tone="muted">
                    {` · ${formatDayAndClock(new Date(summary.strongest.time))}`}
                  </Text>
                </Text>
              </View>
            )}
          </View>
        )}
      </Block>

      {footer}
    </View>
  );
}
