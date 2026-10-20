import type { Forecast, TideTimeline } from "@repo/client/viewer/types";
import * as WebBrowser from "expo-web-browser";
import { Fragment } from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatDayAndClock, formatNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// Where a panel's figures come from: what stands at the point, with its licence, then the
// forecast's credits and its models, and the tide's source. The licences ask for them, so every
// density draws them (decision 061). A link opens in a browser inside the app. The web's
// `Sources` (`point-conditions.tsx`).

// The models the waves come from, in the order of the hours: the first, then each one after it
// with the moment it takes over.
function waveModelLines({ waveModels, swellModels, hours }: Forecast) {
  const hasPeak = hours.some((hour) => hour.wavePeakPeriodSeconds !== null);
  const said = (model: Forecast["waveModels"][number]) => {
    const wide = model.resolutionKilometers;
    return {
      model: model.name,
      kilometers: Number.isInteger(wide) ? String(wide) : formatNumber(wide, 1),
    };
  };
  const then = (model: Forecast["waveModels"][number]) =>
    m.source_wave_model_from({ ...said(model), date: formatDayAndClock(model.from) });
  return [
    ...waveModels.map((model, index) =>
      index > 0
        ? then(model)
        : hasPeak
          ? m.source_wave_model(said(model))
          : m.source_wave_model_mean(said(model)),
    ),
    // The swell apart, which is less sure than the whole sea, with the models it comes from.
    ...(swellModels ?? []).map((model, index) =>
      index > 0 ? then(model) : m.source_swell_model(said(model)),
    ),
  ];
}

/** A word of a credit that opens its page. */
function Link({ url, children }: { url: string; children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      size="xs"
      accessibilityRole="link"
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      style={{ color: colors["neutral-8"], textDecorationLine: "underline" }}
      suppressHighlighting={false}
    >
      {children}
    </Text>
  );
}

export function Sources({
  origin,
  license,
  forecast,
  tides,
}: {
  // Undefined while what stands at the point loads. Null when nothing says where it comes from.
  origin: string | null | undefined;
  // Null when what stands at the point has no licence to name.
  license: { type: string; url: string } | null | undefined;
  forecast: Forecast | undefined;
  tides: TideTimeline | undefined;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      {origin === null ? null : origin && license === null ? (
        <Text size="xs" tone="muted">
          {origin}
        </Text>
      ) : origin && license ? (
        <Text size="xs" tone="muted">
          {origin} <Link url={license.url}>{license.type}</Link>
        </Text>
      ) : (
        <Skeleton height={11} width="75%" />
      )}
      {forecast && (
        <Text size="xs" tone="muted">
          {m.source_forecast()}{" "}
          {forecast.source.credits.map((credit, index) => (
            <Fragment key={credit.url}>
              {index > 0 && ". "}
              <Link url={credit.url}>{credit.text}</Link>
            </Fragment>
          ))}
          .{forecast.source.notice && ` ${forecast.source.notice}`} {m.source_forecast_changes()}
        </Text>
      )}
      {forecast && (
        <Text size="xs" tone="muted">
          {waveModelLines(forecast).join(" ")}
        </Text>
      )}
      {tides && (
        <Text size="xs" tone="muted">
          {m.source_tide({ datum: tides.datum, source: tides.station.source.name })}
        </Text>
      )}
    </View>
  );
}
