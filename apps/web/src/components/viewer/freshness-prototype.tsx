// PROTOTYPE, to delete once a variant is chosen.
// Five ways for a buoy's pill to say how recent its reading is, switchable with `?variant=` on any
// page that shows a pill: the map at /app and the "Map markers" section of /design-system.
// A is what ships today. `BuoyPill` hands over to `PrototypeBuoyPill` for the others.
import { ArrowUpIcon, StarBoldIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ComponentProps, useSyncExternalStore } from "react";

import { type Freshness, formatMeters, formatSeconds } from "@/lib/format";
import { WAVE_HEIGHT_SCALE, scaleColor, scaleInk } from "@/lib/sea-scales";

const VARIANTS = {
  A: "Dot at the end (today)",
  B: "Chip that ripples",
  C: "Chip that empties with age",
  D: "Dot docked on the chip",
  E: "Age in words, only when late",
} as const;

export type FreshnessVariant = keyof typeof VARIANTS;

const KEYS = Object.keys(VARIANTS) as FreshnessVariant[];
const STORAGE_KEY = "prototype:freshness-variant";

function isVariant(value: string | null): value is FreshnessVariant {
  return value !== null && value in VARIANTS;
}

// The address wins on load. The session keeps the choice when the app's own navigation drops the
// parameter from the address.
let current: FreshnessVariant | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): FreshnessVariant {
  if (current === null) {
    const fromAddress = new URLSearchParams(window.location.search).get("variant");
    const fromSession = window.sessionStorage.getItem(STORAGE_KEY);
    current = isVariant(fromAddress) ? fromAddress : isVariant(fromSession) ? fromSession : "A";
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setVariant(next: FreshnessVariant) {
  current = next;
  window.sessionStorage.setItem(STORAGE_KEY, next);
  const url = new URL(window.location.href);
  url.searchParams.set("variant", next);
  window.history.replaceState(window.history.state, "", url);
  for (const listener of listeners) listener();
}

export function useFreshnessVariant(): FreshnessVariant {
  return useSyncExternalStore(subscribe, getSnapshot, () => "A");
}

/** The bar that flips between the variants. Mounted in development only. */
export function FreshnessPrototypeSwitcher() {
  const variant = useFreshnessVariant();
  const step = (by: number) =>
    setVariant(KEYS[(KEYS.indexOf(variant) + by + KEYS.length) % KEYS.length] ?? "A");

  return (
    <div className="fixed bottom-4 left-1/2 z-100 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 font-mono text-xs text-white shadow-lg ring-2 ring-fuchsia-500">
      <button
        type="button"
        aria-label="Previous variant"
        className="cursor-pointer px-2"
        onClick={() => step(-1)}
      >
        ←
      </button>
      <span className="whitespace-nowrap">
        {variant} ({VARIANTS[variant]})
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="cursor-pointer px-2"
        onClick={() => step(1)}
      >
        →
      </button>
    </div>
  );
}

type PrototypeBuoyPillProps = Omit<ComponentProps<"button">, "children"> & {
  variant: Exclude<FreshnessVariant, "A">;
  heightMeters: number;
  periodSeconds: number | null;
  directionDegrees: number | null;
  freshness: Freshness;
  selected?: boolean;
  saved?: boolean;
};

export function PrototypeBuoyPill({
  variant,
  heightMeters,
  periodSeconds,
  directionDegrees,
  freshness,
  selected = false,
  saved = false,
  className,
  ...props
}: PrototypeBuoyPillProps) {
  const color = scaleColor(WAVE_HEIGHT_SCALE, heightMeters);
  const ink = scaleInk(WAVE_HEIGHT_SCALE, heightMeters);
  const late = freshness !== "fresh";
  const old = freshness === "old" || freshness === "none";
  const muted = selected ? "text-neutral-4" : "text-neutral-7";

  // C: the chip is full when fresh, pale when aging, and only an outline when old.
  const hollow = variant === "C" && old;
  const pale = variant === "C" && freshness === "aging";

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "pointer-events-auto relative flex h-7 cursor-pointer items-center gap-xxs rounded-full py-0.5 pr-xs pl-0.5",
        "text-s font-medium whitespace-nowrap tabular-nums",
        "edge bg-neutral-1 text-neutral-10 [--edge-color:var(--neutral-10-transparent)]",
        "transition-[background-color,color,scale] duration-(--motion-duration) ease-theme",
        "focus-ring outline-none",
        "hover:scale-105",
        selected && "scale-110 bg-color-1 text-neutral-1 hover:scale-110",
        // B: the ripple stays inside the pill.
        variant === "B" && "overflow-hidden",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="relative grid size-6 shrink-0 place-items-center">
        {variant === "B" && freshness === "fresh" && (
          <span
            className="absolute inset-0 rounded-full opacity-45 motion-safe:animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite]"
            style={{ background: color }}
          />
        )}
        <span
          className={cn(
            "relative grid size-6 place-items-center rounded-full",
            variant === "B" && freshness === "aging" && "opacity-70",
            variant === "B" && old && "opacity-45 saturate-50",
            pale && "opacity-50",
          )}
          style={
            hollow
              ? { boxShadow: `inset 0 0 0 1.5px ${color}`, color: "currentColor" }
              : { background: color, color: ink }
          }
        >
          {directionDegrees !== null && (
            <ArrowUpIcon
              aria-hidden
              strokeWidth={2.25}
              className={cn("size-3.5 shrink-0", hollow && muted)}
              style={{ rotate: `${directionDegrees + 180}deg` }}
            />
          )}
        </span>
        {variant === "D" && (
          <span
            className={cn(
              "absolute -right-px -bottom-px size-2 rounded-full ring-[1.5px]",
              selected ? "ring-color-1" : "ring-neutral-1",
              freshness === "fresh" && "bg-success",
              freshness === "aging" && "bg-warning",
              old && "bg-neutral-6",
            )}
          />
        )}
      </span>
      <span className={cn("relative", variant === "C" && late && muted)}>
        {formatMeters(heightMeters)}
      </span>
      {periodSeconds !== null && (
        <span className={cn("relative text-xs font-normal", muted)}>
          {formatSeconds(periodSeconds)}
        </span>
      )}
      {saved && <StarBoldIcon aria-hidden className="relative size-2.5 shrink-0" />}
      {/* E: the pill has no age to show, so it says the middle of the range. */}
      {variant === "E" && late && (
        <span
          className={cn(
            "relative rounded-full px-1 text-[0.625rem] leading-4 font-normal",
            selected ? "bg-neutral-1/15 text-neutral-4" : "bg-neutral-3 text-neutral-7",
          )}
        >
          {old ? "4 h" : "2 h"}
        </span>
      )}
    </button>
  );
}
