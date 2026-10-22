import { useMemo, useRef } from "react";
import { View } from "react-native";

import { ForecastPanel } from "@/components/forecast/forecast-panel";
import { SizeAgainstForecast } from "@/components/forecast/size-against-forecast";
import { Sources } from "@/components/forecast/sources";
import { WindDetails } from "@/components/forecast/wind-details";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { PlaceRecord, usePlaceConditions } from "./use-place";

// The forecast tab of a place's sheet, as the web's `BreakPanel`, `StationPanel` and `SpotPanel`
// give their panel what it shows: a station that measures the wind alone gets its wind, any other
// the forecast by the density in force, each with the credits its licences ask for.

type Conditions = ReturnType<typeof usePlaceConditions>;

export function PlaceForecast({
  record,
  conditions,
  now,
  onFold,
  onOpenStation,
}: {
  record: PlaceRecord;
  conditions: Conditions;
  now: number;
  onFold?: (bottom: number) => void;
  onOpenStation: (stationId: string) => void;
}) {
  const { colors, space, radius } = useTheme();
  const { kind, found, station, spot, history } = record;
  const { forecast, tides, extremes } = conditions;
  // A sheltered station's note stands over its panel, and the low sheet ends under the panel's
  // summary all the same, as the web measures its fold from the top of the sheet: where the panel
  // starts under the note, and where its summary ends in it, each known by its own layout.
  const sheltered = kind === "station" && station?.exposure === "sheltered";
  const panelTop = useRef<number | undefined>(undefined);
  const summaryEnd = useRef<number | undefined>(undefined);
  const foldUnderNote = () => {
    if (panelTop.current !== undefined && summaryEnd.current !== undefined) {
      onFold?.(panelTop.current + summaryEnd.current);
    }
  };

  // A break says where it comes from when the instance knows, and on what terms when it has any.
  const source = found?.source;
  const attribution = source?.attribution;
  const breakOrigin =
    attribution && source?.license
      ? m.source_break({ attribution })
      : attribution
        ? m.source_break_unlicensed({ attribution })
        : attribution;
  // The same credits from one render to the next: the forecast is drawn again when what it
  // shows changes, and not when the tab beside it does.
  const footer = useMemo(() => {
    if (kind === "station") {
      const windAlone = station !== undefined && !station.measures.includes("waves");
      return (
        <Sources
          origin={station && m.source_measurements({ attribution: station.attribution })}
          license={station?.license}
          forecast={forecast.data}
          tides={windAlone ? undefined : tides.data}
        />
      );
    }
    if (kind === "spot") {
      return <Sources origin={null} license={null} forecast={forecast.data} tides={tides.data} />;
    }
    return (
      <Sources
        origin={found ? breakOrigin : undefined}
        license={found ? (source?.license ?? null) : undefined}
        forecast={forecast.data}
        tides={tides.data}
      />
    );
  }, [kind, station, found, breakOrigin, source?.license, forecast.data, tides.data]);

  // A place that has left the catalogue, a station that is gone, or a spot that is not the
  // reader's, says so.
  if (record.isError) {
    return (
      <Text size="s" tone="muted">
        {kind === "break"
          ? m.break_not_found()
          : kind === "station"
            ? m.station_not_found()
            : m.spot_not_found()}
      </Text>
    );
  }

  const readings = history.data?.readings;
  // The map's last reading of the station stands until its history comes.
  const latest = record.latest;
  // A station the map holds is known at once: one that measures the wind alone opens on its own
  // panel, never on a buoy's first.
  if (kind === "station" && station && !station.measures.includes("waves")) {
    return (
      <WindDetails
        now={now}
        station={station}
        readings={readings}
        latest={latest}
        historyPending={history.isLoading}
        historyDays={record.historyDays}
        onHistoryExtend={record.onHistoryExtend}
        forecast={forecast}
        footer={footer}
        onFold={onFold}
      />
    );
  }

  const panel = (
    <ForecastPanel
      now={now}
      forecast={forecast}
      tides={tides}
      extremes={extremes}
      onTideExtend={conditions.onTideExtend}
      onFold={
        sheltered
          ? (bottom) => {
              summaryEnd.current = bottom;
              foldUnderNote();
            }
          : onFold
      }
      footer={footer}
      {...(kind === "station"
        ? {
            station,
            readings,
            latest,
            historyPending: history.isLoading,
          }
        : {
            spot: record.point,
            words: kind === "break" ? found?.characteristics : spot?.characteristics,
            offshoreFrom:
              kind === "break"
                ? found?.characteristics.offshoreDirectionDegrees
                : spot?.characteristics?.offshoreDirectionDegrees,
            nearby: conditions.nearby,
            nearbyWind: conditions.nearbyWind,
            onOpenStation,
            sizeAgainst:
              kind === "break" ? (
                <SizeAgainstForecast
                  learned={conditions.sizeFactor}
                  locals={found?.characteristics.sizeFactors}
                  hours={forecast.data?.hours}
                  now={now}
                />
              ) : undefined,
          })}
    />
  );

  if (sheltered) {
    return (
      <View style={{ gap: space.l }}>
        <Text
          size="s"
          style={{
            paddingHorizontal: space.s,
            paddingVertical: space.xs,
            borderRadius: radius.xs,
            overflow: "hidden",
            backgroundColor: colors["warning-transparent"],
          }}
        >
          {m.station_sheltered_note()}
        </Text>
        <View
          onLayout={(event) => {
            panelTop.current = event.nativeEvent.layout.y;
            foldUnderNote();
          }}
        >
          {panel}
        </View>
      </View>
    );
  }
  return panel;
}
