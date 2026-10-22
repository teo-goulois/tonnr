import { periodOf } from "@repo/client/viewer/types";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, scaleInk } from "@repo/client/sea-scales";
import { shoreWind } from "@repo/conditions/shore-wind";
import { ChevronRightIcon } from "@repo/ui/icon";
import { type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { shoreWord } from "@/components/saved/sea-figures";
import { Glyph } from "@/components/shared/glyph";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { compassName, formatAgo, formatNumber, formatSeconds, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatDistance, formatHeight, formatWind, useUnits, windFigure } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { Bearing, DirectionArrow } from "./bearing";
import { colorAt } from "./metrics";
import type { Nearby } from "@repo/client/viewer/nearby";

// What the nearest buoy and the nearest wind station measure, at a surf break or a spot, each a
// row that opens the station's own sheet over this one. The web's `NearbyBuoy` and
// `NearbyWindStation` (`details/parts.tsx`).

/** The disc that says a wave height by its color, with the direction of the waves when known. */
function HeightChip({ heightMeters, from }: { heightMeters: number; from: number | null }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: colorAt(WAVE_HEIGHT_SCALE, heightMeters),
      }}
    >
      {from !== null && (
        <DirectionArrow
          fromDegrees={from}
          size={14}
          color={scaleInk(WAVE_HEIGHT_SCALE, heightMeters)}
        />
      )}
    </View>
  );
}

/** A wind speed on its color with where the wind is going, as the map writes it. */
function WindChip({ knots, from }: { knots: number; from: number | null }) {
  const ink = scaleInk(WIND_SPEED_SCALE, knots);
  return (
    <View
      style={{
        // The web's chip of the wind, 22 pixels tall with 6 each side.
        height: 22,
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        paddingHorizontal: 6,
        borderRadius: 9999,
        backgroundColor: colorAt(WIND_SPEED_SCALE, knots),
      }}
    >
      {from !== null && <DirectionArrow fromDegrees={from} size={12} color={ink} />}
      <Text size="xs" weight="medium" numeric dense numberOfLines={1} style={{ color: ink }}>
        {windFigure(knots)}
      </Text>
    </View>
  );
}

function Row({
  chip,
  title,
  line,
  aside,
  label,
  onPress,
}: {
  chip: ReactNode;
  title: ReactNode;
  line: string;
  aside?: ReactNode;
  label: string;
  onPress?: () => void;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.s,
        paddingVertical: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors["neutral-3"] : colors["neutral-2"],
      })}
    >
      {chip}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title}
        <Text size="xs" tone="muted" numberOfLines={1}>
          {line}
        </Text>
      </View>
      {aside}
      <Glyph icon={ChevronRightIcon} size={14} color={colors["neutral-7"]} />
    </Pressable>
  );
}

export function NearbyBuoy({
  nearby,
  now,
  onOpen,
}: {
  nearby: Nearby;
  now: number;
  onOpen: (stationId: string) => void;
}) {
  useUnits();
  const { space } = useTheme();
  const { station } = nearby;
  const reading = station.latestReading;
  if (!reading || reading.significantHeightMeters === null) return null;
  const height = reading.significantHeightMeters;
  const period = periodOf(reading);
  const from = reading.peakDirectionDegrees;
  const line = `${m.details_nearest_buoy({ distance: formatDistance(nearby.distanceKm) })} · ${station.name}`;

  return (
    <Row
      onPress={() => onOpen(station.id)}
      label={[
        line,
        formatHeight(height),
        period !== null && formatSeconds(period),
        from !== null && `${m.alert_from()} ${compassName(from)}`,
        formatAgo(reading.observedAt, now),
      ]
        .filter(Boolean)
        .join(", ")}
      chip={<HeightChip heightMeters={height} from={from} />}
      title={
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            flexWrap: "wrap",
            columnGap: space.xs,
          }}
        >
          <Text size="s" weight="medium" numeric>
            {formatHeight(height)}
            {period !== null && <Text size="s" tone="muted">{` ${formatSeconds(period)}`}</Text>}
            {from !== null && <Text size="s" tone="muted">{` ${formatNumber(from, 0)}°`}</Text>}
          </Text>
          <Text size="xs" tone="muted">
            {formatAgo(reading.observedAt, now)}
          </Text>
        </View>
      }
      line={line}
    />
  );
}

export function NearbyWindStation({
  nearby,
  now,
  offshoreFrom,
  onOpen,
}: {
  nearby: Nearby;
  now: number;
  offshoreFrom?: number | null;
  onOpen: (stationId: string) => void;
}) {
  useUnits();
  const { colors, space } = useTheme();
  const { station } = nearby;
  const reading = station.latestReading;
  const speed = toKnots(reading?.windSpeedMetersPerSecond);
  if (!reading || speed === null) return null;
  const gust = toKnots(reading.windGustMetersPerSecond);
  const from = reading.windDirectionDegrees;
  const atShore = from !== null && offshoreFrom != null ? shoreWind(from, offshoreFrom) : null;
  const line = `${m.details_nearest_wind({ distance: formatDistance(nearby.distanceKm) })} · ${station.name}`;

  return (
    <Row
      onPress={() => onOpen(station.id)}
      label={[
        line,
        formatWind(speed),
        gust !== null && m.details_gusts_to({ speed: windFigure(gust) }),
        from !== null && `${m.alert_from()} ${compassName(from)}`,
        atShore && shoreWord(atShore),
        formatAgo(reading.observedAt, now),
      ]
        .filter(Boolean)
        .join(", ")}
      chip={<WindChip knots={speed} from={from} />}
      title={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: space.xs,
          }}
        >
          <Text size="s" weight="medium" numeric>
            {formatWind(speed)}
            {gust !== null && (
              <Text
                size="s"
                tone="muted"
              >{` ${m.details_gusts_to({ speed: windFigure(gust) })}`}</Text>
            )}
          </Text>
          {from !== null && <Bearing degrees={from} />}
          <Text size="xs" tone="muted">
            {formatAgo(reading.observedAt, now)}
          </Text>
        </View>
      }
      line={line}
      aside={
        atShore && (
          <View
            style={{
              paddingHorizontal: space.xs,
              minHeight: 22,
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: colors["neutral-3"],
            }}
          >
            <Text size="xs" weight="medium" dense numberOfLines={1}>
              {shoreWord(atShore)}
            </Text>
          </View>
        )
      }
    />
  );
}
