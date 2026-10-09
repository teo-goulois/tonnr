/*
 * PROTOTYPE, to throw away.
 *
 * The question: what should the panel of a buoy or of a surf break look like, so that the swell,
 * its period, its energy and the wind are read together, the buoy beside the model, with the week
 * ahead as a table?
 *
 * Three variants of the panel on the existing `/app` route, switched by `?variant=a|b|c` and by
 * the bar at the bottom of the screen, in development only. Without the parameter the panel is
 * the one in use.
 *
 * Settled on 2026-10-09: every table is the grid that scrolls sideways, a column for each hour. A
 * table with a row for each hour was tried in A and in B, and Téo set it aside.
 *
 * - A, lanes: four tiles for now, four lanes on one span of time, then the week as a grid.
 * - B, focus: the four values are tabs, one large chart for the chosen one, then the week as a grid.
 * - C, one strip: one grid to scroll from two days ago to next week, with the curves and the tide in it.
 *
 * When one has won: move what it needs out of this folder, put its strings in the messages, and
 * delete the folder with the two lines that call it in `station-panel.tsx` and `break-panel.tsx`.
 */

import { useMemo, type ReactNode } from "react";

import type { PointConditionsProps } from "../point-conditions";
import type { Reading, Station } from "../types";
import { measuredSamples, modelSamples } from "./metrics";
import type { DetailsProps } from "./parts";
import type { VariantKey } from "./prototype-switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

type DetailsPrototypeProps = PointConditionsProps & {
  variant: VariantKey;
  // Undefined at a surf break.
  station?: Pick<Station, "latitude" | "longitude" | "measures">;
  readings?: Reading[];
  latest?: Reading | null;
  historyPending?: boolean;
  footer: ReactNode;
};

export function DetailsPrototype({
  variant,
  station,
  readings,
  latest,
  historyPending = false,
  ...conditions
}: DetailsPrototypeProps) {
  const measured = useMemo(() => measuredSamples(readings ?? []), [readings]);
  const hours = conditions.forecast.data?.hours;
  const model = useMemo(() => modelSamples(hours ?? []), [hours]);
  const point = conditions.forecast.data?.point;

  const props: DetailsProps = {
    ...conditions,
    station,
    latest,
    measured,
    model,
    place: station
      ? { latitude: station.latitude, longitude: station.longitude }
      : point && { latitude: point.latitude, longitude: point.longitude },
    // A station that reports the wind alone is read as a buoy too: its lanes of waves stay empty.
    hasBuoy: station !== undefined || historyPending,
    measuresWind: station?.measures.includes("wind") ?? false,
    historyPending,
  };

  if (variant === "a") return <VariantA {...props} />;
  if (variant === "b") return <VariantB {...props} />;
  return <VariantC {...props} />;
}
