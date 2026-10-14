import type { SurfSize } from "@repo/db/schema/sessions";

// How big the waves of a session looked, said by its surfer: decision 043. A size is said
// against a body, which is how surfers tell it, and stands here for a height of face: the
// height a model gives is another thing, measured from trough to crest out at sea, and what the
// two have to do with each other is what the sizes said are kept to learn.

/** A size's height of face, in metres, for a surfer of 1.75 m standing beside the wave. */
export type SurfFace = {
  // From this height, up to the next size's. `most` is null for the last size, which has none.
  least: number;
  most: number | null;
  // The height a picture of the size draws its wave at.
  drawn: number;
};

export const SURF_FACES: Record<SurfSize, SurfFace> = {
  ankle: { least: 0, most: 0.3, drawn: 0.2 },
  knee: { least: 0.3, most: 0.6, drawn: 0.5 },
  waist: { least: 0.6, most: 1, drawn: 0.9 },
  chest: { least: 1, most: 1.3, drawn: 1.2 },
  shoulder: { least: 1.3, most: 1.6, drawn: 1.45 },
  head: { least: 1.6, most: 2, drawn: 1.8 },
  overhead: { least: 2, most: 2.6, drawn: 2.4 },
  double_overhead: { least: 2.6, most: 4, drawn: 3.5 },
  triple_overhead: { least: 4, most: null, drawn: 5.2 },
};

/** The sizes, the smallest first, as `SURF_SIZES` names them. The web app reads them here. */
export const SIZES = Object.keys(SURF_FACES) as SurfSize[];

/** Where a size stands on the scale, from 0 for the smallest. */
export const sizeRank = (size: SurfSize) => SIZES.indexOf(size);

/** Whether the sets said are no smaller than the waves said. Either may be left unsaid. */
export function setsFit(waves: SurfSize | null, sets: SurfSize | null) {
  return waves === null || sets === null || sizeRank(sets) >= sizeRank(waves);
}
