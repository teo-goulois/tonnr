// PROTOTYPE, throwaway: four ways to draw the surfer and the wave of a size, in the tiles of the
// drawer as `main` has them. Switched by `?art=a|b|c|d` or the bar at the top of the drawer.
// Branch `prototype/surf-sizes` only.
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useId, useState } from "react";

const STYLES = {
  a: "Silhouette et planche",
  b: "Trait",
  c: "Géométrique",
  d: "Douce",
} as const;
type Style = keyof typeof STYLES;
const KEYS = Object.keys(STYLES) as Style[];

const read = (): Style => {
  if (typeof window === "undefined") return "a";
  const asked = new URLSearchParams(window.location.search).get("art");
  return KEYS.includes(asked as Style) ? (asked as Style) : "a";
};

function useStyle() {
  const [style, setStyle] = useState<Style>("a");
  useEffect(() => {
    setStyle(read());
    const sync = () => setStyle(read());
    window.addEventListener("surf-art", sync);
    return () => window.removeEventListener("surf-art", sync);
  }, []);
  return style;
}

function go(by: number) {
  const next = KEYS[(KEYS.indexOf(read()) + by + KEYS.length) % KEYS.length]!;
  const url = new URL(window.location.href);
  url.searchParams.set("art", next);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event("surf-art"));
}

export function ArtSwitcher() {
  const style = useStyle();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="flex items-center justify-between gap-xs rounded-full bg-[#ff2d8a] px-xs py-xxs text-s font-medium text-white">
      <button type="button" className="cursor-pointer px-s py-xxs" onClick={() => go(-1)}>
        ←
      </button>
      <span>
        {style.toUpperCase()} · {STYLES[style]}
      </span>
      <button type="button" className="cursor-pointer px-s py-xxs" onClick={() => go(1)}>
        →
      </button>
    </div>
  );
}

export const WIDTH = 100;
export const HEIGHT = 64;
export const WATER = 58;
const LEFT = 36;
const RIGHT = WIDTH + 2;

export type ArtProps = {
  // Heights in pixels: the surfer, the wave, and a bigger set behind it (0 for none).
  tall: number;
  high: number;
  backHigh: number;
  color: string;
  backColor: string;
  className?: string;
};

export function PrototypeArt(props: ArtProps) {
  const style = useStyle();
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden
      className={cn("block h-auto w-full overflow-hidden text-neutral-12", props.className)}
    >
      {style === "a" && <Board {...props} />}
      {style === "b" && <Line {...props} />}
      {style === "c" && <Geometric {...props} />}
      {style === "d" && <Soft {...props} />}
    </svg>
  );
}

// A wave breaking towards the surfer: a hollow face, a lip thrown forward, a gentle back.
function curl(high: number, shift = 0) {
  const wide = RIGHT - LEFT;
  const at = (across: number, up: number) =>
    `${(LEFT + shift + across * wide).toFixed(2)} ${(WATER - up * high).toFixed(2)}`;
  return [
    `M${at(-0.05, 0)}`,
    `C${at(0.28, 0)} ${at(0.47, 0.32)} ${at(0.47, 0.7)}`,
    `C${at(0.47, 0.83)} ${at(0.41, 0.88)} ${at(0.35, 0.86)}`,
    `C${at(0.29, 0.84)} ${at(0.27, 0.74)} ${at(0.31, 0.68)}`,
    `C${at(0.22, 0.7)} ${at(0.2, 0.86)} ${at(0.3, 0.96)}`,
    `C${at(0.4, 1.04)} ${at(0.56, 1.02)} ${at(0.64, 0.9)}`,
    `C${at(0.74, 0.74)} ${at(0.82, 0.1)} ${at(1, 0)}`,
    "Z",
  ].join(" ");
}

// The top of the lip, where the foam is drawn.
function lip(high: number) {
  const wide = RIGHT - LEFT;
  const at = (across: number, up: number) =>
    `${(LEFT + across * wide).toFixed(2)} ${(WATER - up * high).toFixed(2)}`;
  return `M${at(0.31, 0.68)} C${at(0.22, 0.7)} ${at(0.2, 0.86)} ${at(0.3, 0.96)} C${at(0.4, 1.04)} ${at(0.56, 1.02)} ${at(0.64, 0.9)}`;
}

// A person standing, filled, in a box 30 wide and 100 tall whose middle is x = 0.
const PERSON =
  "M-4.6 14.5 C-10 14.8 -12.8 17 -13.3 21.8 L-14.8 46.5 Q-15 49.6 -12.4 49.4 L-11.2 27.5 L-10 51 L-9.6 95.4 Q-9.6 99.6 -5.6 99.6 L-2.2 99.6 Q-1.4 99.6 -1.3 98 L-0.7 57 L0.7 57 L1.3 98 Q1.4 99.6 2.2 99.6 L5.6 99.6 Q9.6 99.6 9.6 95.4 L10 51 L11.2 27.5 L12.4 49.4 Q15 49.6 14.8 46.5 L13.3 21.8 C12.8 17 10 14.8 4.6 14.5 Z";

function Person({ x, tall, className }: { x: number; tall: number; className?: string }) {
  const scale = tall / 100;
  return (
    <g transform={`translate(${x} ${WATER - tall}) scale(${scale})`} className={className}>
      <circle cx={0} cy={6.8} r={6.6} />
      <path d={PERSON} />
    </g>
  );
}

// A. A filled silhouette with a board under its arm, and a wave shaded from its crest down,
// foam on its lip.
function Board({ tall, high, backHigh, color, backColor }: ArtProps) {
  const id = useId();
  const x = 15;
  const boardTall = tall * 1.06;
  const boardWide = tall * 0.15;
  const bx = x + tall * 0.11;
  const top = WATER - boardTall;
  return (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity={0.75} />
        </linearGradient>
      </defs>
      {backHigh > high && (
        <path d={curl(backHigh, 6)} fill={backColor} opacity={0.35} />
      )}
      <path d={curl(high)} fill={`url(#${id}f)`} />
      <path
        d={lip(high)}
        fill="none"
        stroke="white"
        strokeOpacity={0.85}
        strokeWidth={Math.max(0.6, high * 0.035)}
        strokeLinecap="round"
      />
      <line x1={0} x2={WIDTH} y1={WATER} y2={WATER} className="stroke-neutral-5" strokeWidth={0.8} />
      <path
        d={`M${bx} ${top} C${bx + boardWide * 0.62} ${top + boardTall * 0.12} ${bx + boardWide * 0.55} ${WATER - boardTall * 0.12} ${bx} ${WATER} C${bx - boardWide * 0.55} ${WATER - boardTall * 0.12} ${bx - boardWide * 0.62} ${top + boardTall * 0.12} ${bx} ${top} Z`}
        className="fill-neutral-1 stroke-neutral-8"
        strokeWidth={0.7}
      />
      <Person x={x} tall={tall} className="fill-neutral-12" />
    </>
  );
}

// B. Lines alone, as the app's icons are: a pictogram, and a wave whose lip rolls into a spiral.
function Line({ tall, high, backHigh, color, backColor }: ArtProps) {
  const x = 16;
  const at = (share: number) => WATER - tall * share;
  const stroke = 1.6;
  const wave = (h: number, shift = 0) => {
    const wide = RIGHT - LEFT;
    const p = (across: number, up: number) =>
      `${(LEFT + shift + across * wide).toFixed(2)} ${(WATER - up * h).toFixed(2)}`;
    return [
      `M${p(-0.05, 0)}`,
      `C${p(0.32, 0)} ${p(0.44, 0.5)} ${p(0.5, 1)}`,
      `C${p(0.62, 1.04)} ${p(0.8, 0.12)} ${p(1, 0)}`,
    ].join(" ");
  };
  const spiral = (h: number) => {
    const wide = RIGHT - LEFT;
    const p = (across: number, up: number) =>
      `${(LEFT + across * wide).toFixed(2)} ${(WATER - up * h).toFixed(2)}`;
    return `M${p(0.5, 1)} C${p(0.38, 1.03)} ${p(0.25, 0.94)} ${p(0.26, 0.79)} C${p(0.27, 0.67)} ${p(0.39, 0.67)} ${p(0.39, 0.78)}`;
  };
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {backHigh > high && (
        <path d={wave(backHigh, 6)} stroke={backColor} strokeWidth={stroke} opacity={0.45} />
      )}
      <path d={`${wave(high)} L${RIGHT} ${WATER} Z`} fill={color} fillOpacity={0.14} stroke="none" />
      <path d={wave(high)} stroke={color} strokeWidth={stroke} />
      <path d={spiral(high)} stroke={color} strokeWidth={stroke} />
      <line x1={0} x2={WIDTH} y1={WATER} y2={WATER} className="stroke-neutral-6" strokeWidth={1} />
      <g stroke="currentColor" strokeWidth={stroke}>
        <circle cx={x} cy={at(0.9)} r={tall * 0.075} />
        <path d={`M${x} ${at(0.79)} V${at(0.46)}`} />
        <path d={`M${x - tall * 0.13} ${at(0.5)} L${x} ${at(0.74)} L${x + tall * 0.13} ${at(0.5)}`} />
        <path d={`M${x - tall * 0.09} ${WATER} L${x} ${at(0.46)} L${x + tall * 0.09} ${WATER}`} />
      </g>
    </g>
  );
}

// C. Circles and capsules: a wave cut from two circles, as a sign would draw it, and a person
// made of a head and a body.
function Geometric({ tall, high, backHigh, color, backColor }: ArtProps) {
  const id = useId();
  const x = 16;
  const shape = (h: number, shift: number, key: string, fill: string, opacity = 1) => {
    const r = h / 2;
    const cx = 68 + shift - r * 0.15;
    const cy = WATER - r;
    return (
      <g key={key} opacity={opacity}>
        <mask id={`${id}${key}`}>
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="white" />
          <circle cx={cx - r * 0.32} cy={cy + r * 0.28} r={r * 0.58} fill="black" />
          <rect x={0} y={cy + r * 0.28} width={cx - r * 0.32} height={HEIGHT} fill="black" />
        </mask>
        <path
          d={`M${cx - r} ${WATER} V${cy} A${r} ${r} 0 0 1 ${cx + r * 0.7} ${cy - r * 0.71} C${cx + r * 1.4} ${cy} ${cx + r * 1.6} ${WATER} ${cx + r * 2.6} ${WATER} Z`}
          fill={fill}
          mask={`url(#${id}${key})`}
        />
      </g>
    );
  };
  const body = tall * 0.3;
  return (
    <>
      {backHigh > high && shape(backHigh, 6, "back", backColor, 0.35)}
      {shape(high, 0, "front", color)}
      <line x1={0} x2={WIDTH} y1={WATER} y2={WATER} className="stroke-neutral-5" strokeWidth={0.8} />
      <g className="fill-neutral-12">
        <circle cx={x} cy={WATER - tall + tall * 0.1} r={tall * 0.1} />
        <rect
          x={x - body / 2}
          y={WATER - tall * 0.76}
          width={body}
          height={tall * 0.76}
          rx={body / 2}
        />
      </g>
    </>
  );
}

// D. Soft: the swell in three layers that pale towards the back, rounded, and a person in one
// rounded piece.
function Soft({ tall, high, backHigh, color, backColor }: ArtProps) {
  const x = 16;
  const swell = (h: number, shift: number) => {
    const wide = RIGHT - LEFT;
    const p = (across: number, up: number) =>
      `${(LEFT + shift + across * wide).toFixed(2)} ${(WATER - up * h).toFixed(2)}`;
    return `M${p(-0.08, 0)} C${p(0.25, 0)} ${p(0.32, 1)} ${p(0.56, 1)} C${p(0.8, 1)} ${p(0.86, 0)} ${p(1.12, 0)} Z`;
  };
  const w = tall * 0.24;
  return (
    <>
      {backHigh > high && <path d={swell(backHigh, 8)} fill={backColor} opacity={0.3} />}
      <path d={swell(high * 0.82, 10)} fill={color} opacity={0.3} />
      <path d={swell(high * 0.92, 5)} fill={color} opacity={0.55} />
      <path d={swell(high, 0)} fill={color} />
      <line x1={0} x2={WIDTH} y1={WATER} y2={WATER} className="stroke-neutral-5" strokeWidth={0.8} />
      <g className="fill-neutral-12">
        <circle cx={x} cy={WATER - tall * 0.92} r={tall * 0.08} />
        <path
          d={`M${x - w / 2} ${WATER} V${WATER - tall * 0.66} Q${x - w / 2} ${WATER - tall * 0.82} ${x} ${WATER - tall * 0.82} Q${x + w / 2} ${WATER - tall * 0.82} ${x + w / 2} ${WATER - tall * 0.66} V${WATER} Z`}
        />
      </g>
    </>
  );
}
