import { Button } from "@repo/ui/components/ui/button";
import { Switch } from "@repo/ui/components/ui/switch";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, LayersIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useId } from "react";

import { formatDayAndClock, formatNumber } from "@/lib/format";
import { type ScaleStop, WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { FreshnessDot } from "./map-markers";
import type { MapLayers } from "./station-map";

type MapLegendProps = {
  layers: MapLayers;
  onLayersChange: (layers: MapLayers) => void;
  // Shows every layer with its switch. Folded, only the scale of the wave heights is left.
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  // The instant the sea is shown at, and whether that is the present. Undefined while the sea's
  // description loads, or when the provider does not answer.
  seaTime: Date | undefined;
  seaIsNow: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  onSeaStep: (steps: number) => void;
  onSeaNow: () => void;
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
  seaTime,
  seaIsNow,
  canStepBack,
  canStepForward,
  onSeaStep,
  onSeaNow,
  windTruncated,
  breaksTruncated,
  className,
}: MapLegendProps) {
  const surface =
    "edge bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)] rounded-(--radius-xs)";

  if (!expanded) {
    return (
      <div className={cn(surface, "flex w-56 items-center gap-xs py-xs pr-s pl-xs", className)}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.map_layers()}
          aria-expanded={false}
          onClick={() => onExpandedChange(true)}
        >
          <LayersIcon data-slot="icon" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1" title={m.map_wave_height()}>
          <ScaleBar scale={WAVE_HEIGHT_SCALE} ticks={WAVE_TICKS} />
        </div>
      </div>
    );
  }

  return (
    <section aria-label={m.map_layers()} className={cn(surface, "grid w-64 gap-s p-s", className)}>
      <LayerRow
        label={m.map_wave_height()}
        checked={layers.sea}
        onCheckedChange={(sea) => onLayersChange({ ...layers, sea })}
      >
        <ScaleBar scale={WAVE_HEIGHT_SCALE} ticks={WAVE_TICKS} />
        {seaTime && (
          <div className="flex items-center gap-xxs">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.map_sea_earlier()}
              disabled={!canStepBack}
              onClick={() => onSeaStep(-1)}
            >
              <ChevronLeftIcon data-slot="icon" aria-hidden />
            </Button>
            <span className="flex-1 text-center text-s tabular-nums" aria-live="polite">
              {seaIsNow ? m.map_sea_now() : formatDayAndClock(seaTime)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.map_sea_later()}
              disabled={!canStepForward}
              onClick={() => onSeaStep(1)}
            >
              <ChevronRightIcon data-slot="icon" aria-hidden />
            </Button>
            {!seaIsNow && (
              <Button variant="secondary" size="xs" onClick={onSeaNow}>
                {m.map_sea_now()}
              </Button>
            )}
          </div>
        )}
      </LayerRow>

      <LayerRow
        label={m.map_buoys()}
        checked={layers.buoys}
        onCheckedChange={(buoys) => onLayersChange({ ...layers, buoys })}
      >
        <ul className="flex flex-wrap gap-x-s gap-y-xxs text-xs text-neutral-7">
          <li className="flex items-center gap-xxs">
            <FreshnessDot freshness="fresh" />
            {m.map_fresh()}
          </li>
          <li className="flex items-center gap-xxs">
            <FreshnessDot freshness="aging" />
            {m.map_aging()}
          </li>
          <li className="flex items-center gap-xxs">
            <FreshnessDot freshness="old" />
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

      <Button
        variant="ghost"
        size="xs"
        className="justify-self-start"
        aria-expanded
        onClick={() => onExpandedChange(false)}
      >
        <ChevronDownIcon data-slot="icon" aria-hidden />
        {m.map_legend_fold()}
      </Button>
    </section>
  );
}
