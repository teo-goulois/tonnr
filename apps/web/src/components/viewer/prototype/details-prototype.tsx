/*
 * PROTOTYPE, to throw away.
 *
 * The question: what should the panel of a buoy or of a surf break look like, so that the swell,
 * its period, its energy and the wind are read together, the buoy beside the model, with the week
 * ahead as a table?
 *
 * The new panel is on the existing `/app` route behind `?variant=a`, in development only, and the
 * bar at the bottom of the screen goes from it to the panel in use and back.
 *
 * Settled with Téo on 2026-10-09:
 * - Four lanes on one span of time, one under the other, the buoy over the model. Two other
 *   layouts were tried, one large chart chosen by four tabs and one grid holding everything, and
 *   set aside. They are in the history of this folder.
 * - Every table is the grid that scrolls sideways, a column for each hour.
 * - The energy is in kilojoules.
 * - As little text as the panel can do with. What explains is behind a button.
 *
 * When the panel is right: move what it needs out of this folder, put its strings in the
 * messages, give the route the nearest buoy to load, and delete the folder with the lines that
 * call it in `station-panel.tsx` and `break-panel.tsx`.
 */

import { Tabs, TabsList, TabsPanel, TabsTab } from "@repo/ui/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { freshnessOf } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { type PointConditionsProps, Sources } from "../point-conditions";
import { ReadingAge } from "../station-actions";
import type { Reading, Station } from "../types";
import { ViewerDrawer } from "../viewer-drawer";
import { HOUR_MS, measuredSamples, modelSamples, t } from "./metrics";
import { type DetailsProps, nearestBuoy } from "./parts";
import { VariantA } from "./variant-a";

type DetailsPrototypeProps = PointConditionsProps & {
  // The buoy the panel is of. Undefined at a surf break.
  station?: Pick<Station, "latitude" | "longitude" | "measures">;
  readings?: Reading[];
  latest?: Reading | null;
  historyPending?: boolean;
  // The surf break the panel is of. Undefined at a buoy.
  spot?: { latitude: number; longitude: number };
  // What is known of the surf break, for the tab beside its forecast.
  guide?: ReactNode;
  footer: ReactNode;
};

// What a query gives a panel. A query that is switched off is not loading anything.
function loadable<Data>(query: { data: Data | undefined; isLoading: boolean; isError: boolean }) {
  return { data: query.data, isPending: query.isLoading, isError: query.isError };
}

/**
 * A buoy opened from a surf break: its panel in a second drawer, over the break's. Closing it
 * gives the break back, which the map never left. It loads what it shows itself: the route will,
 * once the panel leaves this folder, with the buoy named in the address.
 */
function BuoyDrawer({
  station,
  now,
  open,
  onOpenChange,
}: {
  station: Station | undefined;
  now: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const at = { latitude: station?.latitude ?? 0, longitude: station?.longitude ?? 0 };
  const asked = { enabled: open && station !== undefined, retry: false, meta: { quiet: true } };
  // The tide is a strip of whole days, from yesterday's midnight to the week ahead.
  const span = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() + 7);
    return { start, end };
    // The span changes when the day does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [new Date(now).toDateString()]);

  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({
      input: { id: station?.id ?? "", limit: 2000 },
      ...asked,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({ input: { ...at, days: 7, pastDays: 2 }, ...asked }),
  );
  const tides = useQuery(
    orpc.v1.tides.timeline.queryOptions({ input: { ...at, ...span, stepMinutes: 10 }, ...asked }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({ input: { ...at, ...span }, ...asked }),
  );
  const latest = history.data?.readings[0] ?? station?.latestReading;

  return (
    <ViewerDrawer
      open={open}
      onOpenChange={onOpenChange}
      wide={wide}
      title={station?.name}
      description={
        <ReadingAge
          observedAt={latest?.observedAt}
          freshness={freshnessOf(latest?.observedAt, now)}
          now={now}
        />
      }
    >
      {station && (
        <DetailsPrototype
          now={now}
          station={station}
          readings={history.data?.readings}
          latest={latest}
          historyPending={history.isLoading}
          forecast={loadable(forecast)}
          tides={loadable(tides)}
          extremes={loadable(extremes)}
          footer={
            <Sources
              origin={m.source_measurements({ attribution: station.attribution })}
              license={station.license}
              forecast={forecast.data}
              tides={tides.data}
            />
          }
        />
      )}
    </ViewerDrawer>
  );
}

export function DetailsPrototype({
  station,
  readings,
  latest,
  historyPending = false,
  spot,
  guide,
  ...conditions
}: DetailsPrototypeProps) {
  const strings = t();
  const [buoyOpen, setBuoyOpen] = useState(false);
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = conditions.forecast.data?.hours;
  const model = useMemo(() => modelSamples(hours ?? []), [hours]);
  const point = conditions.forecast.data?.point;

  // The buoys the map already holds: the same question, so no second call. The route will pass
  // the nearest one once the panel leaves this folder.
  const buoys = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "waves", limit: 500 },
      enabled: spot !== undefined,
      select: (answer) => answer.stations,
      meta: { quiet: true },
    }),
  );
  const nearby = useMemo(
    () => (spot && buoys.data ? nearestBuoy(buoys.data, spot, conditions.now) : undefined),
    // A buoy ages with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spot?.latitude, spot?.longitude, buoys.data, Math.floor(conditions.now / HOUR_MS)],
  );

  const props: DetailsProps = {
    ...conditions,
    station,
    latest,
    measured,
    model,
    place: station
      ? { latitude: station.latitude, longitude: station.longitude }
      : (spot ?? (point && { latitude: point.latitude, longitude: point.longitude })),
    // A station that reports the wind alone is read as a buoy too: its lanes of waves stay empty.
    hasBuoy: station !== undefined || historyPending,
    measuresWind: station?.measures.includes("wind") ?? false,
    historyPending,
    nearby,
    onOpenStation: () => setBuoyOpen(true),
  };

  if (!spot) return <VariantA {...props} />;

  // A spot will hold more than its forecast: each part gets a tab.
  return (
    <Tabs defaultValue="forecast" className="gap-m">
      <TabsList>
        <TabsTab value="forecast">{strings.forecastTab}</TabsTab>
        <TabsTab value="guide">{strings.guideTab}</TabsTab>
      </TabsList>
      <TabsPanel value="forecast">
        <VariantA {...props} />
      </TabsPanel>
      <BuoyDrawer
        station={nearby?.station}
        now={conditions.now}
        open={buoyOpen}
        onOpenChange={setBuoyOpen}
      />
      <TabsPanel value="guide">
        {/* What draws the guide draws nothing for a break of which only the place is known. */}
        <div className="peer">{guide}</div>
        <p className="hidden text-s text-neutral-7 peer-empty:block">{strings.guideEmpty}</p>
      </TabsPanel>
    </Tabs>
  );
}
