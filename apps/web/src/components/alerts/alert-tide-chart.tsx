import {
  usePlotArea,
  useYAxisScale,
  ZIndexLayer,
} from "@repo/ui/components/evilcharts/charts/recharts-area-chart";
import { useMemo } from "react";

import { TIDE_COLOR, TIDE_PAST_COLOR } from "@/lib/sea-scales";
import { formatHeight, useUnits } from "@/lib/units";

import { SeaChart } from "../viewer/sea-chart";
import type { AlertCriteria } from "../viewer/types";
import { type TidePoint, tideSteps } from "./tide-band";

// How many colors the curve is painted with from its start to its end: one for half an hour.
const STEPS = 96;
// Under the curve, over the grid.
const BAND_LAYER = -100;
// The room a figure takes beside a line of the band, in pixels.
const FIGURE_ROOM = 14;

type AlertTideChartProps = {
  // Names the curve: whose tide it is.
  label: string;
  // The tide at the spot, over the two days the editor draws.
  points: TidePoint[];
  range: AlertCriteria["tideHeightMeters"];
  trend: AlertCriteria["tideTrend"];
};

/**
 * The tide at a spot beside what an alert asks of it: the heights it takes as a band across the
 * plot, and the curve full where the tide meets them and goes the way that is asked, pale
 * elsewhere.
 */
export function AlertTideChart({ label, points, range, trend }: AlertTideChartProps) {
  // The band's figures are written in the reader's unit: it is drawn again when that changes.
  useUnits();
  const colors = useMemo(
    () =>
      tideSteps(points, { range, trend }, STEPS).map((meets) =>
        meets ? TIDE_COLOR : TIDE_PAST_COLOR,
      ),
    [points, range, trend],
  );

  return (
    <SeaChart
      className="h-28"
      label={label}
      points={points}
      colors={colors}
      formatValue={(value) => formatHeight(value)}
      yAxis={false}
      tooltip={false}
    >
      <Band min={range?.min} max={range?.max} />
    </SeaChart>
  );
}

// The heights an alert takes, across the plot: from its least to its most, or to the edge of
// the plot on the side it leaves open.
function Band({ min, max }: { min: number | undefined; max: number | undefined }) {
  const plot = usePlotArea();
  const yScale = useYAxisScale();
  if (!plot || !yScale || (min === undefined && max === undefined)) return null;
  const floor = plot.y + plot.height;
  const within = (y: number | undefined, otherwise: number) =>
    y === undefined ? otherwise : Math.min(floor, Math.max(plot.y, y));
  const top = max === undefined ? plot.y : within(yScale(max), plot.y);
  const bottom = min === undefined ? floor : within(yScale(min), floor);
  if (bottom <= top) return null;

  return (
    <ZIndexLayer zIndex={BAND_LAYER}>
      <g aria-hidden pointerEvents="none">
        <rect
          x={plot.x}
          y={top}
          width={plot.width}
          height={bottom - top}
          fill={TIDE_COLOR}
          fillOpacity={0.14}
        />
        {[
          // Each figure stands outside the band, beside its line, or inside it where the line
          // is at the edge of the plot.
          { at: top, value: max, y: top - plot.y >= FIGURE_ROOM ? top - 4 : top + 11 },
          { at: bottom, value: min, y: floor - bottom >= FIGURE_ROOM ? bottom + 11 : bottom - 4 },
        ].map(
          ({ at, value, y }) =>
            value !== undefined && (
              <g key={at}>
                <line
                  x1={plot.x}
                  x2={plot.x + plot.width}
                  y1={at}
                  y2={at}
                  stroke={TIDE_COLOR}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                />
                <text x={plot.x + 4} y={y} className="fill-neutral-10 text-xxs tabular-nums">
                  {formatHeight(value)}
                </text>
              </g>
            ),
        )}
      </g>
    </ZIndexLayer>
  );
}
