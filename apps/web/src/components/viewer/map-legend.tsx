import { Switch } from "@repo/ui/components/ui/switch";
import { ChevronDownIcon, LayersIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useId } from "react";

import { formatNumber } from "@/lib/format";
import { type ScaleStop, WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { FreshnessGauge } from "./map-markers";
import type { MapLayers } from "./station-map";

type MapLegendProps = {
  layers: MapLayers;
  onLayersChange: (layers: MapLayers) => void;
  // Shows every layer with its switch. Folded, only the title is left.
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  // The way the legend grows: down from the top of the map, or up from its bottom.
  opens?: "down" | "up";
  // Wind stations and breaks are many: when not all of them are loaded, the legend says how to
  // see the rest.
  windTruncated: boolean;
  breaksTruncated: boolean;
  className?: string;
};

// The values written under a scale. The others only take part in the gradient.
const WAVE_TICKS = [0, 1, 2, 3, 5, 8];
const WIND_TICKS = [0, 10, 20, 30, 50];

// A scale as a bar. Its stops are evenly spaced, so the small values, where most seas are, get as
// much room as the big ones.
function ScaleBar({ scale, ticks }: { scale: ScaleStop[]; ticks: number[] }) {
  const last = scale.length - 1;
  const gradient = scale.map((stop, index) => `${stop.color} ${(index / last) * 100}%`).join(", ");

  return (
    <div aria-hidden className="grid gap-0.5">
      <div
        className="h-2 rounded-full"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="relative h-(--line-xs) text-xs text-neutral-7 tabular-nums">
        {ticks.map((tick) => {
          const index = scale.findIndex((stop) => stop.value === tick);
          return (
            <span
              key={tick}
              className={cn(
                "absolute top-0",
                index === 0 ? "" : index === last ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${(index / last) * 100}%` }}
            >
              {formatNumber(tick)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LayerRow({
  label,
  checked,
  onCheckedChange,
  children,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-xs">
      <div className="flex items-center justify-between gap-s">
        <label htmlFor={id} className="text-s font-medium">
          {label}
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      {checked && children}
    </div>
  );
}

/** What the map's colors mean, and the switch of each of its layers. */
export function MapLegend({
  layers,
  onLayersChange,
  expanded,
  onExpandedChange,
  opens = "down",
  windTruncated,
  breaksTruncated,
  className,
}: MapLegendProps) {
  const bodyId = useId();

  return (
    <section
      aria-label={m.map_layers()}
      className={cn(
        "edge rounded-(--radius-xs) bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)]",
        expanded ? "w-64" : "w-fit",
        className,
      )}
    >
      {/* The title is the button that opens and folds the legend. */}
      <button
        type="button"
        className="focus-ring flex min-h-10 w-full cursor-pointer items-center gap-xs rounded-[inherit] px-s text-s font-medium"
        aria-expanded={expanded}
        aria-controls={expanded ? bodyId : undefined}
        onClick={() => onExpandedChange(!expanded)}
      >
        <LayersIcon aria-hidden className="size-4 text-neutral-7" />
        {m.map_legend()}
        <ChevronDownIcon
          aria-hidden
          // The arrow points where the legend will go: it opens away from the edge it sits on.
          className={cn(
            "ml-auto size-4 text-neutral-7 transition-transform duration-(--motion-duration) ease-theme motion-reduce:transition-none",
            expanded === (opens === "down") && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div id={bodyId} className="grid gap-s px-s pb-s">
          <LayerRow
            label={m.map_wave_height()}
            checked={layers.sea}
            onCheckedChange={(sea) => onLayersChange({ ...layers, sea })}
          >
            <ScaleBar scale={WAVE_HEIGHT_SCALE} ticks={WAVE_TICKS} />
          </LayerRow>

          <LayerRow
            label={m.map_buoys()}
            checked={layers.buoys}
            onCheckedChange={(buoys) => onLayersChange({ ...layers, buoys })}
          >
            <ul className="flex flex-wrap gap-x-s gap-y-xxs text-xs text-neutral-7">
              <li className="flex items-center gap-xxs">
                <span className="relative -m-1 size-6 scale-[0.67] text-neutral-10">
                  <FreshnessGauge freshness="fresh" />
                </span>
                {m.map_fresh()}
              </li>
              <li className="flex items-center gap-xxs">
                <span className="relative -m-1 size-6 scale-[0.67] text-neutral-10">
                  <FreshnessGauge freshness="aging" />
                </span>
                {m.map_aging()}
              </li>
              <li className="flex items-center gap-xxs">
                <span className="relative -m-1 size-6 scale-[0.67] text-neutral-10">
                  <FreshnessGauge freshness="old" />
                </span>
                {m.map_old()}
              </li>
            </ul>
          </LayerRow>

          <LayerRow
            label={m.map_wind()}
            checked={layers.wind}
            onCheckedChange={(wind) => onLayersChange({ ...layers, wind })}
          >
            <ScaleBar scale={WIND_SPEED_SCALE} ticks={WIND_TICKS} />
            {windTruncated && <p className="text-xs text-neutral-7">{m.map_zoom_for_all()}</p>}
          </LayerRow>

          <LayerRow
            label={m.map_breaks()}
            checked={layers.breaks}
            onCheckedChange={(breaks) => onLayersChange({ ...layers, breaks })}
          >
            {breaksTruncated && <p className="text-xs text-neutral-7">{m.map_zoom_for_all()}</p>}
          </LayerRow>
        </div>
      )}
    </section>
  );
}
