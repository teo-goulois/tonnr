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
import { useNavigate } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";

import { orpc } from "@/utils/orpc";

import type { PointConditionsProps } from "../point-conditions";
import type { Reading, Station } from "../types";
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
  const navigate = useNavigate();
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
    onOpenStation: (stationId) =>
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          variant: previous.variant,
          station: stationId,
        }),
      } as never),
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
      <TabsPanel value="guide">
        {/* What draws the guide draws nothing for a break of which only the place is known. */}
        <div className="peer">{guide}</div>
        <p className="hidden text-s text-neutral-7 peer-empty:block">{strings.guideEmpty}</p>
      </TabsPanel>
    </Tabs>
  );
}
