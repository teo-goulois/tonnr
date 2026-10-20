import { type ScaleStop, scaleColor } from "@repo/client/sea-scales";

// What the charts compute before they draw, as the web's `sea-chart.tsx`, `tide-chart.tsx` and
// `metric-lanes.tsx` compute it: round figures for an axis, the colors along a curve, the
// moments the water stands at a height. Pure, so that a test reads it.

/** A point of a curve. */
export type Row = { time: number; value: number };

// A round step that gives about four intervals between 0 and max.
function niceStep(max: number) {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) ?? 10;
  return step * magnitude;
}

/** Round values from zero, or from below it when the curve goes there, to just above the curve. */
export function valueTicks(lowest: number, highest: number) {
  const step = niceStep(Math.max(highest, -lowest, 0.1));
  const bottom = Math.min(0, Math.floor(lowest / step) * step);
  const top = Math.max(step, Math.ceil(highest / step) * step);
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 2; value += step) {
    // Kept to the step's own digits: 0.1 + 0.2 is not written 0.30000000000000004.
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/**
 * Round figures for a value whose curve sits far from zero: a period of 8 s on an axis from zero
 * would be a flat line, so it starts a little under its lowest value.
 */
export function floorTicks(values: number[]) {
  if (values.length === 0) return [0, 1];
  const low = Math.max(0, Math.floor(Math.min(...values)) - 1);
  const high = Math.ceil(Math.max(...values)) + 1;
  const step = Math.max(1, Math.ceil((high - low) / 3));
  const ticks: number[] = [];
  for (let value = low; value < high + step; value += step) ticks.push(value);
  return ticks;
}

/**
 * The colors of a curve along its length, `steps` of them from its first moment to its last, each
 * with where it stands between the two, as Skia's gradient takes them.
 */
export function curveGradient(rows: Row[], scale: ScaleStop[], steps = 24) {
  if (rows.length < 2) return undefined;
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const colors: string[] = [];
  const positions: number[] = [];
  let index = 0;
  for (let step = 0; step < steps; step++) {
    const part = step / (steps - 1);
    const time = first.time + part * (last.time - first.time);
    while (index < rows.length - 2 && rows[index + 1]!.time < time) index++;
    const before = rows[index]!;
    const after = rows[index + 1] ?? before;
    const ratio =
      after.time === before.time ? 0 : (time - before.time) / (after.time - before.time);
    const value = before.value + (after.value - before.value) * Math.min(1, Math.max(0, ratio));
    colors.push(colorAt(scale, value));
    positions.push(part);
  }
  return { colors, positions, from: first.time, to: last.time };
}

/**
 * A color of a scale at a value, as both React Native and Skia read it: `rgba(r, g, b, a)`. The
 * scales write `rgb(r g b)`, which Skia does not take.
 */
export function colorAt(scale: ScaleStop[], value: number, alpha = 1) {
  const [red = 0, green = 0, blue = 0] = scaleColor(scale, value).match(/\d+(\.\d+)?/g) ?? [];
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** A moment the water stands at a height, and whether it rises there. */
export type Crossing = Row & { rising: boolean };

/** The moments the water stands at a height, each placed between the two predictions around it. */
export function crossingsAt(rows: Row[], level: number) {
  const crossings: Crossing[] = [];
  for (let index = 1; index < rows.length; index++) {
    const before = rows[index - 1]!;
    const after = rows[index]!;
    const rising = before.value < level && level <= after.value;
    const falling = before.value > level && level >= after.value;
    if (!rising && !falling) continue;
    const ratio = (level - before.value) / (after.value - before.value);
    crossings.push({
      time: before.time + ratio * (after.time - before.time),
      value: level,
      rising,
    });
  }
  return crossings;
}

/** The height of the water at a moment between two predictions. */
export function heightAt(rows: Row[], time: number) {
  const next = rows.findIndex((row) => row.time >= time);
  if (next <= 0) return undefined;
  const before = rows[next - 1]!;
  const after = rows[next]!;
  return (
    before.value +
    ((time - before.time) / (after.time - before.time)) * (after.value - before.value)
  );
}

/**
 * The moments the time axis names: every `everyHours` from a round hour, or the noons when the
 * step is a day, where a day is named.
 */
export function timeTicks(start: number, end: number, everyHours: number) {
  const ticks: number[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (everyHours >= 24) cursor.setHours(12);
  else cursor.setHours(Math.ceil(cursor.getHours() / everyHours) * everyHours);
  for (; cursor.getTime() <= end; cursor.setHours(cursor.getHours() + everyHours)) {
    if (cursor.getTime() >= start) ticks.push(cursor.getTime());
  }
  return ticks;
}

/** The midnights between two moments, where a day is ruled. */
export function midnightsBetween(start: number, end: number) {
  const days: number[] = [];
  const midnight = new Date(start);
  midnight.setHours(24, 0, 0, 0);
  for (; midnight.getTime() < end; midnight.setDate(midnight.getDate() + 1)) {
    days.push(midnight.getTime());
  }
  return days;
}
