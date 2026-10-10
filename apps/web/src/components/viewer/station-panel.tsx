import { m } from "@/paraglide/messages.js";

import { Details } from "./details/details";
import { type PointConditionsProps, Sources } from "./point-conditions";
import type { Loadable, Station, StationReadings } from "./types";

type StationPanelProps = PointConditionsProps & {
  // What the map already knows of the station, shown while its history loads.
  station: Station | undefined;
  history: Loadable<StationReadings>;
};

/** What a station measures now and lately, beside the model, then the week and the tide there. */
export function StationPanel({
  now,
  station: known,
  history,
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
