import { SIZES, SURF_FACES } from "@repo/conditions/sessions/sizes";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useState } from "react";

import { heightFigure, heightUnit, useUnits } from "@/lib/units";
import { scaleColor, WAVE_HEIGHT_SCALE } from "@/lib/sea-scales";
import { m } from "@/paraglide/messages.js";

import { ViewerDrawer } from "../viewer/viewer-drawer";
// PROTOTYPE
import { ArtSwitcher, PrototypeArt } from "./surf-size-art-prototype";
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

// The picture's box: a surfer stands on the left, the wave rises on the right.
const WIDTH = 100;
const HEIGHT = 64;
const WATER = 58;
const TOP = 6;
// The surfer, in metres, against whom every size is said.
const SURFER = 1.75;

/** A surfer standing, drawn from their feet at (x, y), `tall` pixels tall. */
function Surfer({ x, y, tall }: { x: number; y: number; tall: number }) {
  const at = (share: number) => y - tall * share;
  return (
    <g stroke="currentColor" strokeLinecap="round" fill="none">
      <circle cx={x} cy={at(0.93)} r={tall * 0.07} fill="currentColor" stroke="none" />
      <path d={`M${x} ${at(0.8)} V${at(0.5)}`} strokeWidth={tall * 0.12} />
      <path
        d={`M${x - tall * 0.06} ${at(0.78)} L${x - tall * 0.12} ${at(0.52)} M${x + tall * 0.06} ${at(0.78)} L${x + tall * 0.12} ${at(0.52)}`}
        strokeWidth={tall * 0.055}
      />
      <path
        d={`M${x - tall * 0.03} ${at(0.5)} L${x - tall * 0.06} ${y} M${x + tall * 0.03} ${at(0.5)} L${x + tall * 0.06} ${y}`}
        strokeWidth={tall * 0.075}
      />
    </g>
  );
}

/** A wave whose crest stands `high` pixels over the water, its lip thrown towards the surfer. */
function wavePath(high: number) {
  const left = 34;
  const wide = WIDTH - left;
  // A point of the wave, from its foot on the left (0, 0) to its back on the right (1, 0).
  const at = (across: number, up: number) => `${left + across * wide} ${WATER - up * high}`;
  return [
    `M${at(0, 0)}`,
    // The face, hollow as it rises.
    `C${at(0.38, 0)} ${at(0.48, 0.55)} ${at(0.42, 0.82)}`,
    // The underside of the lip, out over the face to its tip.
    `C${at(0.36, 0.95)} ${at(0.25, 0.9)} ${at(0.22, 0.7)}`,
    // Its top, back to the crest.
    `C${at(0.3, 0.98)} ${at(0.5, 1.04)} ${at(0.6, 0.97)}`,
    // The back, which falls away more gently.
    `C${at(0.76, 0.86)} ${at(0.84, 0)} ${at(1, 0)}`,
    "Z",
  ].join(" ");
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
  const perMeter = (WATER - TOP) / Math.max(SURFER * 1.05, face, back);
  // PROTOTYPE: the drawing is one of the prototype's styles.
  return (
    <PrototypeArt
      tall={SURFER * perMeter}
      high={face * perMeter}
      backHigh={back * perMeter}
      color={scaleColor(WAVE_HEIGHT_SCALE, face)}
      backColor={scaleColor(WAVE_HEIGHT_SCALE, back)}
      className={className}
    />
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
        {/* PROTOTYPE */}
        <div className="mb-m">
          <ArtSwitcher />
        </div>
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
