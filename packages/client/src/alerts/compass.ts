import type { Arc, ArcKey } from "./alert-words";

// The compass an alert's sector is set on, as the web's `CompassDial` and the phone's `Compass`
// both draw it: where a point of the dial stands, where a finger points, the steps a handle comes
// to rest on, and the sector a part opens on before anything is chosen. Decision 031, "The
// editor".

/** A handle moves by this many degrees, dragged, with the arrows or by a screen reader. */
export const COMPASS_STEP = 5;

/** An angle between 0 and 360. */
export const onCompass = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Where a handle that moves comes to rest: on one of the dial's steps. */
export const onStep = (degrees: number) =>
  onCompass(Math.round(degrees / COMPASS_STEP) * COMPASS_STEP);

/** Where a bearing stands on a circle of the dial, from its middle: y goes down. */
export function onDial(degrees: number, radius: number) {
  const angle = (degrees * Math.PI) / 180;
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) };
}

/** The bearing a point points at from the middle of the dial, clockwise from north: y goes down. */
export function bearingOf(dx: number, dy: number) {
  return onCompass((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Where the sea or the wind comes from when the forecast says nothing of the hour. */
export const USUAL_ARCS: Record<ArcKey, Arc> = {
  waveDirectionDegrees: { from: 250, to: 310 },
  primarySwellDirectionDegrees: { from: 250, to: 310 },
  windDirectionDegrees: { from: 45, to: 135 },
};

/**
 * The sector a part opens on before anything is chosen: sixty degrees around where it comes from
 * at this hour, on the dial's steps, or the usual one when the forecast does not say.
 */
export function startingArc(key: ArcKey, at: number | null | undefined): Arc {
  if (at == null) return USUAL_ARCS[key];
  return { from: onStep(at - 30), to: onStep(at + 30) };
}
