import { useEffect, useMemo, useRef, useState } from "react";

type Point = { time: Date; value: number | null };

type LineChartProps = {
  // Names the single series, so the chart needs no legend.
  label: string;
  unit: string;
  points: Point[];
  // A moment to mark with a vertical rule, such as now.
  marker?: Date;
  height?: number;
};

const MARGIN = { top: 10, right: 12, bottom: 24, left: 34 };
const HOUR_MS = 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" });
const hourFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const tooltipFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const valueFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

// A round step that gives four or five ticks between 0 and max.
function niceStep(max: number) {
  const rough = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10;
  return step * magnitude;
}

// Midnights when the span covers days, every six hours otherwise.
function timeTicks(start: number, end: number) {
  const ticks: { time: number; label: string }[] = [];
  const everyHours = end - start > 36 * HOUR_MS ? 24 : 6;

  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(Math.ceil(cursor.getHours() / everyHours) * everyHours);
  for (; cursor.getTime() <= end; cursor.setHours(cursor.getHours() + everyHours)) {
    if (cursor.getTime() < start) continue;
    ticks.push({
      time: cursor.getTime(),
      label: everyHours === 24 ? dayFormat.format(cursor) : hourFormat.format(cursor),
    });
  }
  return ticks;
}

export function LineChart({ label, unit, points, marker, height = 170 }: LineChartProps) {
  const [ref, width] = useWidth();
  const [hovered, setHovered] = useState<number | null>(null);

  const measured = useMemo(
    () =>
      points.flatMap((point) =>
        point.value === null ? [] : [{ time: point.time.getTime(), value: point.value }],
      ),
    [points],
  );

  const first = measured[0];
  const last = measured.at(-1);
  if (!first || !last || first.time === last.time) {
    return (
      <div ref={ref} className="text-muted-foreground flex items-center text-sm" style={{ height }}>
        Pas encore assez de mesures pour tracer une courbe.
      </div>
    );
  }

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const step = niceStep(Math.max(...measured.map((point) => point.value), 0.1));
  const top = Math.ceil(Math.max(...measured.map((point) => point.value)) / step) * step || step;
  const bottom = Math.min(
    0,
    Math.floor(Math.min(...measured.map((point) => point.value)) / step) * step,
  );

  const x = (time: number) =>
    MARGIN.left + ((time - first.time) / (last.time - first.time)) * innerWidth;
  const y = (value: number) => MARGIN.top + (1 - (value - bottom) / (top - bottom)) * innerHeight;

  // A gap in the measurements breaks the line instead of being bridged.
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (point.value === null) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${x(point.time.getTime()).toFixed(1)},${y(point.value).toFixed(1)}`;
    penDown = true;
  }

  const yTicks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) yTicks.push(value);

  const hoveredPoint = hovered === null ? undefined : measured[hovered];
  const markerTime = marker?.getTime();
  const showMarker = markerTime !== undefined && markerTime > first.time && markerTime < last.time;

  const start = first.time;
  const span = last.time - first.time;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time = start + ((event.clientX - bounds.left - MARGIN.left) / innerWidth) * span;

    let nearest = 0;
    let smallestGap = Number.POSITIVE_INFINITY;
    for (const [index, point] of measured.entries()) {
      const gap = Math.abs(point.time - time);
      if (gap < smallestGap) {
        nearest = index;
        smallestGap = gap;
      }
    }
    setHovered(nearest);
  }

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}, de ${tooltipFormat.format(first.time)} à ${tooltipFormat.format(last.time)}`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHovered(null)}
        >
          {yTicks.map((value) => (
            <g key={value}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-border"
              />
              <text
                x={MARGIN.left - 6}
                y={y(value)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {valueFormat.format(value)}
              </text>
            </g>
          ))}
          {timeTicks(first.time, last.time).map((tick) => (
            <text
              key={tick.time}
              x={x(tick.time)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {tick.label}
            </text>
          ))}
          {showMarker && (
            <line
              x1={x(markerTime)}
              x2={x(markerTime)}
              y1={MARGIN.top}
              y2={height - MARGIN.bottom}
              strokeDasharray="3 3"
              className="stroke-muted-foreground"
            />
          )}
          <path
            d={path}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
          />
          {hoveredPoint && (
            <g>
              <line
                x1={x(hoveredPoint.time)}
                x2={x(hoveredPoint.time)}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
                className="stroke-muted-foreground"
              />
              <circle
                cx={x(hoveredPoint.time)}
                cy={y(hoveredPoint.value)}
                r={4.5}
                strokeWidth={2}
                className="fill-[#2a78d6] stroke-background dark:fill-[#3987e5]"
              />
            </g>
          )}
        </svg>
      )}
      {hoveredPoint && (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute top-0 rounded-md border px-2 py-1 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(x(hoveredPoint.time) - 70, 0), Math.max(width - 140, 0)),
            width: 140,
          }}
        >
          <div className="text-muted-foreground">{tooltipFormat.format(hoveredPoint.time)}</div>
          <div className="font-medium tabular-nums">
            {valueFormat.format(hoveredPoint.value)} {unit}
          </div>
        </div>
      )}
    </div>
  );
}
