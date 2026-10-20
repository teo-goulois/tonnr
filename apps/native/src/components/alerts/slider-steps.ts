// Where the thumbs of a slider stand by the steps of its range, and which one a press takes.
// Read by the sliders of an alert's editor, with no React Native in it, so that a test reads it.

// A value on a step, written without what adding a tenth leaves behind: 0.30000000000000004.
const clean = (value: number) => Math.round(value * 1e6) / 1e6;

/** The step of the line nearest a value, within its ends. */
export function snapped(value: number, min: number, max: number, step: number) {
  const steps = Math.round((value - min) / step);
  return clean(Math.min(max, Math.max(min, min + steps * step)));
}

/** A value moved by a number of steps, within the ends. */
export function stepped(value: number, by: number, min: number, max: number, step: number) {
  return snapped(value + by * step, min, max, step);
}

/**
 * The thumb a press at a value takes: the nearer, or the one on the side the press is when the
 * two stand together, so that two thumbs that met can part again either way.
 */
export function nearestThumb([least, most]: readonly [number, number], value: number): 0 | 1 {
  if (value <= least) return 0;
  if (value >= most) return 1;
  return value - least <= most - value ? 0 : 1;
}
