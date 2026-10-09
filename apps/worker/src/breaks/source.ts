import type { surfBreak } from "@repo/db/schema/spots";
import type { UpstreamError } from "@repo/upstream";
import type { Effect } from "effect";

import type { FormatError } from "../providers/format-error";

type Row = typeof surfBreak.$inferInsert;

/** What a list may say a break is like. Each field is one of the catalogue's columns. */
export type Characteristics = {
  [
    Field in
      | "breakTypes"
      | "waveDirections"
      | "bottomTypes"
      | "abilityLevels"
      | "boardTypes"
      | "bestSeasons"
      | "bestTides"
      | "bestSwellDirections"
      | "bestWindDirections"
      | "offshoreDirectionDegrees"
  ]?: NonNullable<Row[Field]>;
};

/** A surf break as a list gives it. */
export type ListedBreak = {
  // The break's identifier in the list, for example "node/123".
  ref: string;
  name: string;
  latitude: number;
  longitude: number;
  // The page that shows the break, when the list names one.
  url?: string;
  characteristics?: Characteristics;
  // The places the break lies in, from the widest to the nearest.
  location?: string[];
  timezone?: string;
  // What else the list says of the break. It is kept aside as it is.
  details?: Record<string, unknown>;
};

/** A list of breaks to add to the catalogue, and what it says of where it comes from. */
export type BreakList = {
  // The short name of the list. With a break's reference, it tells a break already added.
  provider: string;
  license?: { type: string; url: string };
  attribution?: string;
  breaks: ListedBreak[];
};

/** A list of surf breaks that the worker can fetch, and the terms on which it is published. */
export type BreakSource = {
  id: string;
  license: { type: string; url: string };
  attribution: string;
  fetchBreaks: Effect.Effect<
    // `unreadable` holds the references of breaks the source lists and that could not be read,
    // such as an area without a centre.
    { breaks: ListedBreak[]; unreadable: string[] },
    UpstreamError | FormatError
  >;
};
