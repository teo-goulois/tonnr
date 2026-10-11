import { m } from "@/paraglide/messages.js";

import { Details } from "./details/details";
import { HISTORY_DAYS } from "./details/wind";
import { WindDetails } from "./details/wind-details";
import { type PointConditionsProps, Sources } from "./point-conditions";
import type { Loadable, Station, StationReadings } from "./types";

type StationPanelProps = PointConditionsProps & {
  // What the map already knows of the station, shown while its history loads.
  station: Station | undefined;
  history: Loadable<StationReadings>;
  // How many days of readings the history holds, and how a panel asks for a week of them.
  historyDays?: number;
  onHistoryExtend?: () => void;
};

/**
 * What a station measures now and lately. A buoy is read beside the model, with the week and
 * the tide there. A station that measures the wind alone shows its wind, beside the model's,
 * and nothing of the sea.
 */
export function StationPanel({
  now,
  station: known,
  history,
  historyDays = HISTORY_DAYS,
  onHistoryExtend,
  forecast,
  tides,
  extremes,
  onTideExtend,
}: StationPanelProps) {
  const station = history.data?.station ?? known;
  // The map's list already holds the latest reading, so only a station opened by its address waits.
  const latest = history.data?.readings[0] ?? known?.latestReading;

  if (history.isError && !known) {
    return <p className="text-s text-neutral-7">{m.station_not_found()}</p>;
  }

  if (station && !station.measures.includes("waves")) {
    return (
      <WindDetails
        now={now}
        station={station}
        readings={history.data?.readings}
        latest={latest}
        historyPending={history.isPending}
        historyDays={historyDays}
        onHistoryExtend={onHistoryExtend}
        forecast={forecast}
        footer={
          <Sources
            origin={m.source_measurements({ attribution: station.attribution })}
            license={station.license}
            forecast={forecast.data}
            tides={undefined}
          />
        }
      />
    );
  }

  return (
    <div className="grid gap-l">
      {station?.exposure === "sheltered" && (
        <p className="rounded-(--radius-xs) bg-warning-transparent px-s py-xs text-s">
          {m.station_sheltered_note()}
        </p>
      )}
      <Details
        now={now}
        station={station}
        readings={history.data?.readings}
        latest={latest}
        historyPending={history.isPending}
        forecast={forecast}
        tides={tides}
        extremes={extremes}
        onTideExtend={onTideExtend}
        footer={
          <Sources
            origin={station && m.source_measurements({ attribution: station.attribution })}
            license={station?.license}
            forecast={forecast.data}
            tides={tides.data}
          />
        }
      />
    </div>
  );
}
