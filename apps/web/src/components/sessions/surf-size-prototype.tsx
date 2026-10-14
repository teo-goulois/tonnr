// PROTOTYPE, throwaway: four ways to draw the nine sizes in the session's drawer, switched by
// `?sizes=a|b|c|d` or the bar at the top of the drawer. Branch `prototype/surf-sizes` only.
import { SIZES, SURF_FACES } from "@repo/conditions/sessions/sizes";
import { CheckIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useState } from "react";

import { scaleColor, WAVE_HEIGHT_SCALE } from "@/lib/sea-scales";

import { MorphText } from "../shared/morph-text";
import { sizeFace, sizeName } from "./surf-size";
import type { SurfSize } from "./types";

export type ChoicesProps = {
  value: SurfSize | null;
  // Sizes under it cannot be chosen: the waves, when the sets are asked for.
  least?: SurfSize | null;
  onPick: (size: SurfSize) => void;
  label: string;
};

const VARIANTS = {
  a: "Le corps comme règle",
  b: "Liste",
  c: "Niveaux d'eau",
  d: "Barres",
} as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];

const read = (): Variant => {
  const asked = new URLSearchParams(window.location.search).get("sizes");
  return KEYS.includes(asked as Variant) ? (asked as Variant) : "a";
};

function useVariant() {
  const [variant, setVariant] = useState<Variant>("a");
  useEffect(() => {
    setVariant(read());
    const sync = () => setVariant(read());
    window.addEventListener("surf-sizes", sync);
    return () => window.removeEventListener("surf-sizes", sync);
  }, []);
  const go = (by: number) => {
    const next = KEYS[(KEYS.indexOf(read()) + by + KEYS.length) % KEYS.length]!;
    const url = new URL(window.location.href);
    url.searchParams.set("sizes", next);
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event("surf-sizes"));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { variant, go };
}

function Switcher({ variant, go }: ReturnType<typeof useVariant>) {
  return (
    <div className="flex items-center justify-between gap-xs rounded-full bg-[#ff2d8a] px-xs py-xxs text-s font-medium text-white">
      <button type="button" className="cursor-pointer px-s py-xxs" onClick={() => go(-1)}>
        ←
      </button>
      <span>
        {variant.toUpperCase()} · {VARIANTS[variant]}
      </span>
      <button type="button" className="cursor-pointer px-s py-xxs" onClick={() => go(1)}>
        →
      </button>
    </div>
  );
}

const rank = (size: SurfSize) => SIZES.indexOf(size);
const colorOf = (size: SurfSize) => scaleColor(WAVE_HEIGHT_SCALE, SURF_FACES[size].drawn);
const SURFER = 1.75;

// A standing person, 36 wide and 100 tall, feet at the bottom.
const BODY =
  "M12 15 H24 Q31 16 32 22 L34 50 Q34 53 31 53 L29.5 53 L28 31 L27 31 L27 96 Q27 100 23 100 L20 100 L19 60 H17 L16 100 L13 100 Q9 100 9 96 L9 31 L8 31 L6.5 53 L5 53 Q2 53 2 50 L4 22 Q5 16 12 15 Z";

function Person({ x, y, tall, className }: { x: number; y: number; tall: number; className?: string }) {
  const scale = tall / 100;
  return (
    <g transform={`translate(${x - 18 * scale} ${y - tall}) scale(${scale})`} className={className}>
      <circle cx={18} cy={7} r={7} />
      <path d={BODY} />
    </g>
  );
}

/** The drawer's choices, as the variant in force draws them, under the prototype's bar. */
export function PrototypeChoices(props: ChoicesProps) {
  const state = useVariant();
  return (
    <div className="grid gap-m">
      <Switcher {...state} />
      {state.variant === "a" && <BodyRuler {...props} />}
      {state.variant === "b" && <PlainList {...props} />}
      {state.variant === "c" && <WaterLevels {...props} />}
      {state.variant === "d" && <Bars {...props} />}
    </div>
  );
}

// A. One tall surfer, and the nine sizes on a ruler beside them, the biggest at the top: a press
// on a line fills the water up the body to it.
function BodyRuler({ value, least, onPick, label }: ChoicesProps) {
  const [hover, setHover] = useState<SurfSize | null>(null);
  const shown = hover ?? value;
  const ROW = 38;
  const rows = [...SIZES].reverse();
  const height = ROW * rows.length;
  // Six lines along the body, three over it: each line's middle is the level it stands for.
  const bodyTop = ROW * 3 + ROW / 2;
  const feet = height - 4;
  const perMeter = (feet - bodyTop) / SURFER;
  const levelY = (size: SurfSize) => rows.indexOf(size) * ROW + ROW / 2;
  const waterY = shown
    ? rank(shown) <= rank("head")
      ? feet - SURF_FACES[shown].drawn * perMeter
      : levelY(shown) - ROW / 2 + 4
    : feet;

  return (
    <div className="flex gap-s">
      <svg viewBox={`0 0 110 ${height}`} className="w-28 shrink-0" aria-hidden>
        <rect
          x={0}
          y={waterY}
          width={110}
          height={feet - waterY}
          fill={shown ? colorOf(shown) : "transparent"}
          opacity={0.55}
          className="transition-[y,height] duration-300 ease-out"
        />
        <Person x={55} y={feet} tall={SURFER * perMeter} className="fill-neutral-12" />
        <line x1={0} x2={110} y1={feet} y2={feet} className="stroke-neutral-6" strokeWidth={1} />
        {/* Over the head, a head more each time. */}
        {(["overhead", "double_overhead", "triple_overhead"] as const).map((size) => (
          <text
            key={size}
            x={55}
            y={levelY(size) + 5}
            textAnchor="middle"
            className="fill-neutral-7 text-[13px] tabular-nums"
          >
            {size === "overhead" ? "+½" : size === "double_overhead" ? "×2" : "×3"}
          </text>
        ))}
      </svg>
      <div role="group" aria-label={label} className="grid min-w-0 flex-1">
        {rows.map((size) => {
          const off = least ? rank(size) < rank(least) : false;
          const isChosen = size === value;
          return (
            <button
              key={size}
              type="button"
              disabled={off}
              aria-pressed={isChosen}
              onClick={() => onPick(size)}
              onPointerEnter={() => setHover(size)}
              onPointerLeave={() => setHover(null)}
              style={{ height: ROW }}
              className={cn(
                "focus-ring flex cursor-pointer items-center justify-between gap-xs rounded-(--radius-xs) px-xs text-left outline-none",
                "border-t border-dashed border-neutral-4 first:border-t-0",
                "disabled:cursor-default disabled:opacity-35",
                isChosen && "bg-neutral-3 font-medium",
              )}
            >
              <span className="truncate">{sizeName(size)}</span>
              <span className="shrink-0 text-s text-neutral-7 tabular-nums">{sizeFace(size)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// B. A list as a phone's settings are: a small level on the left, the name, the height, a check.
function PlainList({ value, least, onPick, label }: ChoicesProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="edge grid rounded-(--radius-xs) [--edge-color:var(--neutral-4)] [&>*+*]:shadow-[inset_0_var(--border-s)_0_var(--neutral-4)]"
    >
      {SIZES.map((size, index) => {
        const off = least ? rank(size) < rank(least) : false;
        const isChosen = size === value;
        return (
          <button
            key={size}
            type="button"
            disabled={off}
            aria-pressed={isChosen}
            onClick={() => onPick(size)}
            className="focus-ring flex min-h-12 cursor-pointer items-center gap-s px-s text-left outline-none hover:bg-neutral-3-transparent disabled:cursor-default disabled:opacity-35"
          >
            {/* Nine little steps, filled up to this one. */}
            <span aria-hidden className="flex h-5 shrink-0 items-end gap-[2px]">
              {SIZES.map((step, at) => (
                <span
                  key={step}
                  className="w-[3px] rounded-full"
                  style={{
                    height: `${20 + at * 10}%`,
                    background: at <= index ? colorOf(size) : "var(--neutral-4)",
                  }}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">{sizeName(size)}</span>
            <span className="shrink-0 text-s text-neutral-7 tabular-nums">{sizeFace(size)}</span>
            <CheckIcon
              data-slot="icon"
              aria-hidden
              className={cn("size-4 shrink-0", isChosen ? "opacity-100" : "opacity-0")}
            />
          </button>
        );
      })}
    </div>
  );
}

// C. Nine tiles of one surfer, the water up to where the size says. Past the head, surfers
// stand on one another's shoulders: two for double overhead, three for triple.
function WaterLevels({ value, least, onPick, label }: ChoicesProps) {
  const W = 60;
  const H = 72;
  const FLOOR = H - 2;
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-xs">
      {SIZES.map((size) => {
        const off = least ? rank(size) < rank(least) : false;
        const isChosen = size === value;
        const stack = size === "triple_overhead" ? 3 : size === "double_overhead" ? 2 : 1;
        const meters = SURF_FACES[size].drawn;
        const reach = Math.max(SURFER * stack, meters) * 1.25;
        const perMeter = (FLOOR - 4) / Math.max(reach, SURFER * 1.15);
        const tall = SURFER * perMeter;
        const water = FLOOR - meters * perMeter;
        return (
          <button
            key={size}
            type="button"
            disabled={off}
            aria-pressed={isChosen}
            onClick={() => onPick(size)}
            className={cn(
              "focus-ring grid cursor-pointer gap-xxs overflow-hidden rounded-(--radius-xs) bg-neutral-2 pb-xs text-center outline-none",
              "edge disabled:cursor-default disabled:opacity-35",
              isChosen
                ? "[--edge-color:var(--neutral-12)] [--edge-width:var(--border-m)]"
                : "[--edge-color:transparent]",
            )}
          >
            <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="block w-full">
              {Array.from({ length: stack }, (_, at) => (
                <Person
                  key={at}
                  x={W / 2}
                  y={FLOOR - at * tall * 0.83}
                  tall={tall}
                  className={at === 0 ? "fill-neutral-12" : "fill-neutral-8"}
                />
              ))}
              <rect x={0} y={water} width={W} height={H - water} fill={colorOf(size)} opacity={0.6} />
              <line x1={0} x2={W} y1={water} y2={water} stroke={colorOf(size)} strokeWidth={1.5} />
            </svg>
            <span className="px-xxs text-s leading-tight font-medium text-balance">{sizeName(size)}</span>
            <span className="text-xs text-neutral-7 tabular-nums">{sizeFace(size)}</span>
          </button>
        );
      })}
    </div>
  );
}

// D. Nine bars on one line, as tall as their faces, under a line at a surfer's height: what is
// chosen is written large over them.
function Bars({ value, least, onPick, label }: ChoicesProps) {
  const [hover, setHover] = useState<SurfSize | null>(null);
  const shown = hover ?? value;
  const TALLEST = SURF_FACES.triple_overhead.drawn;
  const HEIGHT = 168;
  const headAt = (SURFER / TALLEST) * HEIGHT;
  return (
    <div className="grid gap-s">
      <div className="grid min-h-14 content-end text-center">
        <p className="text-xl font-medium">
          <MorphText>{shown ? sizeName(shown) : "Choisis une barre"}</MorphText>
        </p>
        <p className="text-s text-neutral-7 tabular-nums">
          {shown ? `${sizeFace(shown)} de face` : " "}
        </p>
      </div>
      <div role="group" aria-label={label} className="relative flex items-end gap-xxs" style={{ height: HEIGHT }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-7"
          style={{ bottom: headAt }}
        >
          <span className="absolute -top-5 left-0 text-xs text-neutral-7">Ta tête</span>
        </div>
        {SIZES.map((size) => {
          const off = least ? rank(size) < rank(least) : false;
          const isChosen = size === value;
          return (
            <button
              key={size}
              type="button"
              disabled={off}
              aria-pressed={isChosen}
              aria-label={sizeName(size)}
              onClick={() => onPick(size)}
              onPointerEnter={() => setHover(size)}
              onPointerLeave={() => setHover(null)}
              className="focus-ring group flex h-full min-w-0 flex-1 cursor-pointer items-end rounded-t-[6px] outline-none disabled:cursor-default disabled:opacity-25"
            >
              <span
                className={cn(
                  "block w-full rounded-t-[6px] transition-opacity",
                  value && !isChosen ? "opacity-40 group-hover:opacity-80" : "opacity-100",
                )}
                style={{
                  height: Math.max(4, (SURF_FACES[size].drawn / TALLEST) * HEIGHT),
                  background: colorOf(size),
                }}
              />
            </button>
          );
        })}
      </div>
      <div aria-hidden className="flex justify-between text-xs text-neutral-7">
        <span>Cheville</span>
        <span>Triple overhead</span>
      </div>
    </div>
  );
}
