import { SIZES, SURF_FACES } from "@repo/conditions/sessions/sizes";
import { Button } from "@repo/ui/components/ui/button";
import { SurferFillIcon, WaveFillIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, type SVGProps, useState } from "react";

import { heightFigure, heightUnit, useUnits } from "@/lib/units";
import { scaleColor, WAVE_HEIGHT_SCALE } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { ViewerDrawer } from "../viewer/viewer-drawer";
import type { SurfSize } from "./types";

// How big the waves of a session looked, said by its surfer against a body: decision 043.

const NAMES: Record<SurfSize, () => string> = {
  ankle: m.surf_size_ankle,
  knee: m.surf_size_knee,
  waist: m.surf_size_waist,
  chest: m.surf_size_chest,
  shoulder: m.surf_size_shoulder,
  head: m.surf_size_head,
  overhead: m.surf_size_overhead,
  double_overhead: m.surf_size_double_overhead,
  triple_overhead: m.surf_size_triple_overhead,
};

export const sizeName = (size: SurfSize) => NAMES[size]();

/** The height of face a size stands for, in the reader's unit: "0.6–1 m", or "13 ft+". */
export function sizeFace(size: SurfSize) {
  const { least, most } = SURF_FACES[size];
  // A foot is small enough to be said whole.
  const digits = heightUnit() === m.unit_ft() ? 0 : 1;
  return most === null
    ? `${heightFigure(least, digits)} ${heightUnit()}+`
    : `${heightFigure(least, digits)}–${heightFigure(most, digits)} ${heightUnit()}`;
}

/** What was said of a session's waves, in a few words: "Chest · Overhead". */
export function sizesWords(waves: SurfSize | null, sets: SurfSize | null) {
  if (waves && sets && waves !== sets) return `${sizeName(waves)} · ${sizeName(sets)}`;
  const one = waves ?? sets;
  return one ? sizeName(one) : null;
}

// The picture's box: a surfer stands on the left, the wave rises on the right, its lip towards them.
const WIDTH = 100;
const HEIGHT = 64;
const WATER = 58;
const TOP = 6;
// The surfer, in metres, against whom every size is said.
const SURFER = 1.75;

// What the two icons draw of their box of 18: the person from their head to their feet, and the
// wave from its crest down to the flat water it rises from, cut there from the curves under it.
const PERSON = { left: 4.6, top: 0, wide: 8.8, high: 18 };
const WAVE = { left: 1, top: 2.1, wide: 16, high: 8.3 };
// Where the wave begins, and how far its width follows its height: a small wave is stretched a
// little, so that it is not drawn too narrow to be read, and a big one no wider than the box.
const WAVE_LEFT = 30;
const WAVE_STRETCH = { least: 1.6, most: 4.4 };
// Room over the surfer, which keeps them a little short of the top of a picture of small waves.
const HEADROOM = 1.2;
// The least a wave is drawn, in pixels: an ankle's, drawn to the surfer's scale, would be a line.
const LEAST_WAVE = 8;

/** A surfer standing, drawn from their feet at (x, WATER), `tall` pixels tall. */
function Surfer({ x, tall }: { x: number; tall: number }) {
  const wide = (tall * PERSON.wide) / PERSON.high;
  return (
    <SurferFillIcon
      x={x - wide / 2}
      y={WATER - tall}
      width={wide}
      height={tall}
      viewBox={`${PERSON.left} ${PERSON.top} ${PERSON.wide} ${PERSON.high}`}
    />
  );
}

/** A wave whose crest stands `high` pixels over the water, turned so that it breaks to the left. */
function Wave({
  high,
  shift = 0,
  ...props
}: { high: number; shift?: number } & SVGProps<SVGSVGElement>) {
  const upright = high / WAVE.high;
  const across = Math.min(Math.max(upright, WAVE_STRETCH.least), WAVE_STRETCH.most);
  const wide = WAVE.wide * across;
  // A wave drawn behind stands a little further, never past the right of the box.
  const left = Math.min(WAVE_LEFT + shift, WIDTH - wide);
  return (
    <g transform={`translate(${2 * left + wide} 0) scale(-1 1)`}>
      <WaveFillIcon
        x={left}
        y={WATER - high}
        width={wide}
        height={high}
        viewBox={`${WAVE.left} ${WAVE.top} ${WAVE.wide} ${WAVE.high}`}
        preserveAspectRatio="none"
        {...props}
      />
    </g>
  );
}

/**
 * A size drawn: a surfer of 1.75 m beside a wave of its height of face, both to one scale, so
 * that the wave is read against the body. A bigger set may be drawn behind it, paler.
 */
export function SurfSizePicture({
  size,
  behind,
  className,
}: {
  size: SurfSize;
  behind?: SurfSize | null;
  className?: string;
}) {
  const face = SURF_FACES[size].drawn;
  const back = behind ? SURF_FACES[behind].drawn : 0;
  // The scale fits the tallest of the surfer and the waves in the box.
  const perMeter = (WATER - TOP) / Math.max(SURFER * HEADROOM, face, back);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden
      className={cn("block h-auto w-full overflow-hidden text-neutral-12", className)}
    >
      {back > face && (
        <Wave
          high={back * perMeter}
          shift={8}
          color={scaleColor(WAVE_HEIGHT_SCALE, back)}
          opacity={0.4}
        />
      )}
      <Wave
        high={Math.max(face * perMeter, LEAST_WAVE)}
        color={scaleColor(WAVE_HEIGHT_SCALE, face)}
      />
      <line
        x1={0}
        x2={WIDTH}
        y1={WATER}
        y2={WATER}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={0.75}
      />
      <Surfer x={16} tall={SURFER * perMeter} />
    </svg>
  );
}

/** The nine sizes as pictures to press, those under `least` not to be chosen. */
function SizeChoices({
  value,
  least,
  picture,
  onPick,
  label,
}: {
  value: SurfSize | null;
  least?: SurfSize | null;
  picture: (size: SurfSize) => ReactNode;
  onPick: (size: SurfSize) => void;
  label: string;
}) {
  const from = least ? SIZES.indexOf(least) : 0;
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-xs">
      {SIZES.map((size, index) => {
        const isChosen = size === value;
        return (
          <button
            key={size}
            type="button"
            aria-pressed={isChosen}
            disabled={index < from}
            onClick={() => onPick(size)}
            className={cn(
              "focus-ring edge grid cursor-pointer gap-xxs rounded-(--radius-xs) p-xs text-center outline-none",
              "transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-3-transparent",
              "disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent",
              isChosen
                ? "bg-neutral-3 [--edge-color:var(--neutral-12)] [--edge-width:var(--border-m)]"
                : "[--edge-color:var(--neutral-4)]",
            )}
          >
            {picture(size)}
            <span className="text-s leading-tight font-medium text-balance">{sizeName(size)}</span>
            <span className="truncate text-xs leading-tight text-neutral-7 tabular-nums">
              {sizeFace(size)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type SurfSizeInputProps = {
  waves: SurfSize | null;
  sets: SurfSize | null;
  onChange: (waves: SurfSize | null, sets: SurfSize | null) => void;
  wide: boolean;
  disabled?: boolean;
};

/**
 * How big the waves looked, on a pill of the form: a press opens a drawer that asks first for
 * most of the waves, then for the sets, each among nine pictures of a surfer beside a wave. No
 * size is offered before the surfer says one, so that none is said for being offered.
 */
export function SurfSizeInput({ waves, sets, onChange, wide, disabled }: SurfSizeInputProps) {
  useUnits();
  // The step the drawer is at, and the waves picked at the first. Null while it is closed.
  const [step, setStep] = useState<"waves" | "sets" | null>(null);
  const [picked, setPicked] = useState<SurfSize | null>(null);
  const said = sizesWords(waves, sets);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={said ? m.surf_size_said({ waves: said }) : m.surf_size_ask()}
        onClick={() => {
          setPicked(waves);
          setStep("waves");
        }}
        className={cn(
          "inline-flex min-w-0 cursor-pointer items-center rounded-full bg-neutral-3 px-s py-xs lg:py-xxs",
          "focus-ring outline-none transition-colors duration-(--motion-duration) ease-theme hover:bg-neutral-4",
          "disabled:cursor-default disabled:text-neutral-6",
          !said && "text-neutral-7",
        )}
      >
        <span className="truncate">{said ?? m.surf_size_add()}</span>
      </button>

      <ViewerDrawer
        open={step !== null}
        onOpenChange={(open) => {
          if (!open) setStep(null);
        }}
        wide={wide}
        title={step === "sets" ? m.surf_size_sets() : m.surf_size_waves()}
        description={m.surf_size_hint()}
        onBack={step === "sets" ? () => setStep("waves") : undefined}
      >
        {step === "waves" && (
          <div className="grid gap-m">
            <SizeChoices
              label={m.surf_size_waves()}
              value={picked}
              picture={(size) => <SurfSizePicture size={size} />}
              onPick={(size) => {
                setPicked(size);
                setStep("sets");
              }}
            />
            {(waves ?? sets) && (
              <Button
                variant="ghost"
                onClick={() => {
                  onChange(null, null);
                  setStep(null);
                }}
              >
                {m.surf_size_clear()}
              </Button>
            )}
          </div>
        )}
        {step === "sets" && picked && (
          <SizeChoices
            label={m.surf_size_sets()}
            // The sets said before stay chosen while they are no smaller than the waves.
            value={sets && SIZES.indexOf(sets) >= SIZES.indexOf(picked) ? sets : null}
            least={picked}
            // Each set is drawn behind the waves that were said.
            picture={(size) => <SurfSizePicture size={picked} behind={size} />}
            onPick={(size) => {
              onChange(picked, size);
              setStep(null);
            }}
          />
        )}
      </ViewerDrawer>
    </>
  );
}
