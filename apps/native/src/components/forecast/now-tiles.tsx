import { periodOf } from "@repo/client/viewer/types";
import type { Reading } from "@repo/client/viewer/types";
import { ChevronDownIcon, InfoIcon } from "@repo/ui/icon";
import { type ReactNode, useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { IconButton } from "@/components/ui/button";
import { TARGET } from "@/components/ui/metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { compassName, formatNumber, formatSeconds } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, formatTemperature, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { Bearing, DirectionArrow, LineGlyph } from "./bearing";
import {
  DAY_MS,
  METRIC_KEYS,
  type MetricKey,
  bias,
  formatMetric,
  metricColor,
  metrics,
} from "./metrics";
import { type SeaRead, nowOf } from "./now";

// The values now, each on its tile, as the web's `NowTiles` draws them: beside a buoy's figure,
// the model's, with its dashed line. A value the buoy does not measure is the model's. A tile is
// one thing to a screen reader: its name, its figure, where it comes from.

type NowTilesProps = SeaRead & {
  // Which values get a tile, and whether the model's figure is written under the buoy's: the
  // density of the panel says. Decision 061.
  keys?: MetricKey[];
  withModel?: boolean;
  hasBuoy: boolean;
  isLoading: boolean;
};

export function NowTiles({
  keys = METRIC_KEYS,
  withModel = true,
  hasBuoy,
  isLoading,
  ...read
}: NowTilesProps) {
  // Drawn again when the reader changes units: the tiles are written in them.
  useUnits();
  const { colors, space, radius } = useTheme();
  const all = metrics();

  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      {keys.map((key) => {
        const metric = all[key];
        const now = nowOf(metric, read);
        const said = [
          metric.label,
          now.shown === undefined ? "–" : formatMetric(metric, now.shown),
          now.bearing !== undefined && `${m.alert_from()} ${compassName(now.bearing)}`,
          hasBuoy &&
            withModel &&
            now.measured !== undefined &&
            now.model !== undefined &&
            `${m.details_model()} ${formatMetric(metric, now.model)}`,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <View
            key={key}
            accessible
            accessibilityLabel={isLoading ? metric.label : said}
            accessibilityState={{ busy: isLoading }}
            style={{
              flex: 1,
              minWidth: 0,
              gap: space.xxs,
              paddingHorizontal: space.xs,
              paddingVertical: space.xs,
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
                {metric.label}
              </Text>
              {now.bearing !== undefined && !isLoading && (
                <DirectionArrow fromDegrees={now.bearing} size={12} color={colors["neutral-10"]} />
              )}
            </View>
            {isLoading ? (
              <Skeleton height={31} width={40} />
            ) : (
              <Text size="l" weight="medium" numeric dense numberOfLines={1} adjustsFontSizeToFit>
                {now.shown === undefined ? "–" : formatMetric(metric, now.shown, false)}
                {now.shown !== undefined && (
                  <Text size="xs" tone="muted">
                    {` ${metric.unit}`}
                  </Text>
                )}
              </Text>
            )}
            <View
              style={{
                minHeight: 15,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.xxs,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    isLoading || now.shown === undefined
                      ? colors["neutral-4"]
                      : metricColor(metric, now.shown),
                }}
              />
              {/* The sea's bearing in degrees, as the table writes it: the wind's arrow is enough. */}
              {!isLoading && metric.direction === "waveDirection" && now.bearing !== undefined && (
                <Text size="xs" tone="muted" numeric dense>
                  {formatNumber(now.bearing, 0)}°
                </Text>
              )}
            </View>
            {/* A surf break has the model alone: nothing to tell apart, so nothing is written. */}
            {hasBuoy && withModel && (
              <View
                style={{
                  minHeight: 15,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xxs,
                }}
              >
                {!isLoading && now.model !== undefined && (
                  <>
                    <LineGlyph dashed />
                    <Text size="xs" tone="muted" numeric dense numberOfLines={1}>
                      {now.measured === undefined
                        ? m.details_model()
                        : formatMetric(metric, now.model, false)}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** What a buoy reads beside the tiles. It stays folded until it is asked for. */
export function ReadingMore({ latest }: { latest?: Reading | null }) {
  useUnits();
  const { colors, space } = useTheme();
  const [open, setOpen] = useState(false);
  if (!latest) return null;

  // A buoy gives one period among three: the line says which.
  const period =
    latest.peakPeriodSeconds !== null
      ? m.station_period_peak()
      : latest.significantPeriodSeconds !== null
        ? m.station_period_significant()
        : latest.meanPeriodSeconds !== null
          ? m.station_period_mean()
          : null;
  const periodValue = periodOf(latest);
  const listed: (false | [string, ReactNode])[] = [
    latest.peakDirectionDegrees !== null && [
      m.details_direction(),
      <Bearing key="direction" degrees={latest.peakDirectionDegrees} withDegrees size="xs" />,
    ],
    latest.maxHeightMeters !== null && [
      m.details_max_height(),
      formatHeight(latest.maxHeightMeters),
    ],
    period !== null && periodValue !== null && [period, formatSeconds(periodValue)],
    latest.waterTemperatureCelsius !== null && [
      m.details_water(),
      formatTemperature(latest.waterTemperatureCelsius),
    ],
  ];
  const rows = listed.filter((row) => row !== false);
  if (rows.length === 0) return null;

  return (
    <View style={{ gap: space.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={{
          alignSelf: "flex-end",
          minHeight: TARGET - 16,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xxs,
        }}
      >
        <Text size="xs" tone="muted">
          {m.details_more()}
        </Text>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <Glyph icon={ChevronDownIcon} size={12} color={colors["neutral-7"]} />
        </View>
      </Pressable>
      {open && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.xxs }}>
          {rows.map(([name, value]) => (
            <View
              key={name}
              accessible
              style={{
                width: "50%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.xs,
                paddingRight: space.s,
              }}
            >
              <Text size="xs" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Text>
              {typeof value === "string" ? (
                <Text size="xs" numeric>
                  {value}
                </Text>
              ) : (
                value
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * What there is to know before trusting the curves of a buoy: how far the model stands from it,
 * that the model's past hours are its latest run, and whether the buoy measures the wind. The
 * phone's own alert says it, behind a button, so that the panel stays bare.
 */
export function About({ measuresWind, ...read }: SeaRead & { measuresWind: boolean }) {
  const height = metrics().height;
  const drift = bias(read.measured, read.model, "height", read.now - DAY_MS);
  const notes = [
    drift !== undefined &&
      (Math.abs(drift) < 0.15
        ? m.details_bias_none()
        : (drift > 0 ? m.details_bias_high : m.details_bias_low)({
            value: formatMetric(height, Math.abs(drift)),
          })),
    m.details_model_note(),
    !measuresWind && m.details_no_wind_sensor(),
  ].filter((note) => note !== false);

  return (
    <IconButton
      icon={InfoIcon}
      label={m.details_about()}
      variant="ghost"
      onPress={() =>
        Alert.alert(
          m.details_about(),
          [`— ${m.details_buoy()}  - - ${m.details_model()}`, ...notes].join("\n\n"),
        )
      }
    />
  );
}
