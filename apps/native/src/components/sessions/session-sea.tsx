import type { Session, SessionDetail } from "@repo/client/viewer/types";
import { forecastSource, type WaveModelId } from "@repo/conditions/forecasts/wave-models";
import type { ShoreWind } from "@repo/conditions/shore-wind";
import { ArrowUpIcon } from "@repo/ui/icon";
import { Fragment } from "react";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { Text, type TextStep } from "@/components/ui/text";
import { compassName, compassPoint, formatSeconds, toKnots } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatDistance, formatHeight, formatTemperature, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

// What the sea did during a session, as the web's `session-sea.tsx` says it: on a line in a list,
// and in full where the session is read. A direction is an arrow that points the way the sea or
// the wind goes, then the point it comes from: never a name alone. Decision 043.

const SHORE_WIND_NAMES: Record<ShoreWind, () => string> = {
  offshore: m.wind_offshore,
  cross_offshore: m.wind_cross_offshore,
  cross_shore: m.wind_cross_shore,
  cross_onshore: m.wind_cross_onshore,
  onshore: m.wind_onshore,
};

// Why a session has nothing of the models, in words.
const MISSING: Record<NonNullable<Session["modelMissing"]>, () => string> = {
  no_sea: m.session_sea_none,
  too_old: m.session_sea_too_old,
  unavailable: m.session_sea_waiting,
};

/** A part of a line: a figure, or a direction. */
type Part = { text: string } | { from: number };

const said = (part: Part) => ("text" in part ? part.text : compassName(part.from));

/** Where a wind or a swell comes from: an arrow the way it goes, then the name of its point. */
export function Bearing({
  degrees,
  size = "s",
  color,
}: {
  degrees: number;
  size?: TextStep;
  color?: string;
}) {
  const { colors, type } = useTheme();
  const ink = color ?? colors["neutral-7"];
  return (
    <View
      accessible
      accessibilityLabel={compassName(degrees)}
      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
    >
      <View style={{ transform: [{ rotate: `${degrees + 180}deg` }] }}>
        <Glyph icon={ArrowUpIcon} size={Math.round(type[size].size * 0.9)} color={ink} />
      </View>
      <Text size={size} numeric dense style={{ color: ink }}>
        {compassPoint(degrees)}
      </Text>
    </View>
  );
}

/** Parts on a line, a point between two of them. */
function Parts({ parts, size = "s", color }: { parts: Part[]; size?: TextStep; color?: string }) {
  const { colors } = useTheme();
  const ink = color ?? colors["neutral-7"];
  return (
    <>
      {parts.map((part, index) => (
        // The parts keep their order: nothing else tells them apart.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 ? (
            <Text size={size} dense style={{ color: ink }}>
              {" · "}
            </Text>
          ) : null}
          {"text" in part ? (
            <Text size={size} numeric dense style={{ color: ink }}>
              {part.text}
            </Text>
          ) : (
            <Bearing degrees={part.from} size={size} color={ink} />
          )}
        </Fragment>
      ))}
    </>
  );
}

type Figures = Session["figures"];

function wavesOf(figures: Figures): Part[] {
  const period = figures.wavePeakPeriodSeconds ?? figures.wavePeriodSeconds;
  if (figures.waveHeightMeters === null) return [];
  return [
    { text: formatHeight(figures.waveHeightMeters) },
    ...(period === null ? [] : [{ text: formatSeconds(period) }]),
    ...(figures.waveDirectionDegrees === null ? [] : [{ from: figures.waveDirectionDegrees }]),
  ];
}

function windOf(figures: Figures): Part[] {
  if (figures.windSpeedMetersPerSecond === null) return [];
  return [
    { text: formatWind(toKnots(figures.windSpeedMetersPerSecond)) },
    ...(figures.windDirectionDegrees === null ? [] : [{ from: figures.windDirectionDegrees }]),
    ...(figures.shoreWind ? [{ text: SHORE_WIND_NAMES[figures.shoreWind]() }] : []),
  ];
}

function tideOf(figures: Figures): Part[] {
  if (figures.tideHeightMeters === null) return [];
  return [
    { text: formatHeight(figures.tideHeightMeters) },
    ...(figures.tideTrend
      ? [
          {
            text: figures.tideTrend === "rising" ? m.alert_trend_rising() : m.alert_trend_falling(),
          },
        ]
      : []),
  ];
}

/**
 * What the sea did during a session, on a line: the waves, the wind and the tide at its middle,
 * each kept whole, the next going under it when the line is narrow. A session of which the models
 * gave nothing says why.
 */
export function SessionSea({ session }: { session: Pick<Session, "figures" | "modelMissing"> }) {
  useUnits();
  const { space } = useTheme();
  const groups: [string, Part[]][] = [
    [m.alert_summary_waves(), wavesOf(session.figures)],
    [m.alert_summary_wind(), windOf(session.figures)],
    [m.alert_summary_tide(), tideOf(session.figures)],
  ];
  const shown = groups.filter(([, parts]) => parts.length > 0);
  if (shown.length === 0) {
    return session.modelMissing ? (
      <Text size="s" tone="muted">
        {MISSING[session.modelMissing]()}
      </Text>
    ) : null;
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.s }}>
      {shown.map(([name, parts]) => (
        <View
          key={name}
          accessible
          accessibilityLabel={`${name} ${parts.map(said).join(", ")}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <Text size="s" tone="muted" dense>
            {name}
          </Text>
          <Parts parts={parts} />
        </View>
      ))}
    </View>
  );
}

/** A line of what was kept: what it is, then its figures. */
function Line({ name, parts }: { name: string; parts: Part[] }) {
  const { colors, space } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${parts.map(said).join(", ")}`}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: space.s,
        paddingVertical: space.xxs,
      }}
    >
      <Text size="s" tone="muted" style={{ flexShrink: 1 }}>
        {name}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          alignItems: "center",
          flexShrink: 1,
        }}
      >
        <Parts parts={parts} color={colors["neutral-10"]} />
      </View>
    </View>
  );
}

/**
 * Everything that was kept of the sea with a session: the models' figures at its middle, then
 * what the buoy and the wind station near it measured.
 */
export function SessionConditions({ session }: { session: SessionDetail }) {
  useUnits();
  const { space } = useTheme();
  const { figures } = session;
  const waves = wavesOf(figures);
  const wind = windOf(figures);
  const tide = tideOf(figures);
  const sky: Part[] = [
    ...(figures.airTemperatureCelsius === null
      ? []
      : [{ text: formatTemperature(figures.airTemperatureCelsius, 0) }]),
    ...(figures.cloudCoverPercent === null
      ? []
      : [{ text: m.session_cloud({ percent: figures.cloudCoverPercent }) }]),
  ];
  const { buoy, measuredWind: measured } = figures;

  return (
    <View style={{ gap: space.xxs }}>
      <Text weight="medium" accessibilityRole="header">
        {m.session_sea_title()}
      </Text>
      {waves.length === 0 && session.modelMissing ? (
        <Text size="s" tone="muted">
          {MISSING[session.modelMissing]()}
        </Text>
      ) : null}
      {waves.length > 0 ? <Line name={m.alert_summary_waves()} parts={waves} /> : null}
      {figures.primarySwellHeightMeters !== null ? (
        <Line
          name={m.alert_summary_swell()}
          parts={[
            { text: formatHeight(figures.primarySwellHeightMeters) },
            ...(figures.primarySwellDirectionDegrees === null
              ? []
              : [{ from: figures.primarySwellDirectionDegrees }]),
          ]}
        />
      ) : null}
      {wind.length > 0 ? (
        <Line
          name={m.alert_summary_wind()}
          parts={[
            ...wind,
            ...(figures.windGustMetersPerSecond === null
              ? []
              : [
                  {
                    text: m.session_gusts({
                      speed: formatWind(toKnots(figures.windGustMetersPerSecond)),
                    }),
                  },
                ]),
          ]}
        />
      ) : null}
      {tide.length > 0 ? <Line name={m.alert_summary_tide()} parts={tide} /> : null}
      {sky.length > 0 ? <Line name={m.session_sky()} parts={sky} /> : null}
      {buoy && buoy.significantHeightMeters !== null ? (
        <Line
          name={m.session_buoy({ name: buoy.name, distance: formatDistance(buoy.distanceKm) })}
          parts={[
            { text: formatHeight(buoy.significantHeightMeters) },
            ...(buoy.periodSeconds === null ? [] : [{ text: formatSeconds(buoy.periodSeconds) }]),
            ...(buoy.directionDegrees === null ? [] : [{ from: buoy.directionDegrees }]),
            ...(buoy.waterTemperatureCelsius === null
              ? []
              : [
                  {
                    text: m.session_water({
                      temperature: formatTemperature(buoy.waterTemperatureCelsius),
                    }),
                  },
                ]),
          ]}
        />
      ) : null}
      {measured && measured.speedMetersPerSecond !== null ? (
        <Line
          name={m.session_wind_measured({
            name: measured.name,
            distance: formatDistance(measured.distanceKm),
          })}
          parts={[
            { text: formatWind(toKnots(measured.speedMetersPerSecond)) },
            ...(measured.directionDegrees === null ? [] : [{ from: measured.directionDegrees }]),
          ]}
        />
      ) : null}
    </View>
  );
}

/** Whose a session's figures are: the models', the tide's station, and each station that measured. */
export function SessionCredits({ session }: { session: SessionDetail }) {
  const { conditions } = session;
  const models = [
    ...(conditions?.model?.waveModels ?? []),
    ...(conditions?.model?.swellModels ?? []),
  ];
  const credits = [
    models.length > 0 &&
      `${m.source_forecast()} ${forecastSource(models as WaveModelId[]).attribution}`,
    conditions?.tide &&
      m.session_tide_source({
        station: conditions.tide.station.name,
        datum: conditions.tide.datum,
      }),
    conditions?.buoy && m.session_station_source({ attribution: conditions.buoy.attribution }),
    conditions?.wind &&
      conditions.wind.attribution !== conditions.buoy?.attribution &&
      m.session_station_source({ attribution: conditions.wind.attribution }),
  ].filter(Boolean);
  if (credits.length === 0) return null;
  return (
    <Text size="xs" tone="muted">
      {credits.join(" ")}
    </Text>
  );
}
