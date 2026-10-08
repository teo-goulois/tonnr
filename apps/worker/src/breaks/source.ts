import type { UpstreamError } from "@repo/upstream";
import type { Effect } from "effect";

import type { FormatError } from "../providers/format-error";

/** A surf break as a source lists it. */
export type ListedBreak = {
  // The break's identifier at the source, for example "node/123".
  ref: string;
  name: string;
  latitude: number;
  longitude: number;
  // The page of the source that shows the break.
  url: string;
};

export type BreakList = {
  breaks: ListedBreak[];
  // The references of breaks the source lists and that could not be read, such as an area
  // without a centre. A break known under one of them stays as it was.
  unreadable: string[];
};

/** A list of surf breaks that may be republished, and the terms on which it may. */
export type BreakSource = {
  id: string;
  // Standard five-field cron expression, in UTC.
  schedule: string;
  licenseType: string;
  licenseUrl: string;
  attribution: string;
  // The whole list, every time: a break missing from it has left the source.
  fetchBreaks: Effect.Effect<BreakList, UpstreamError | FormatError>;
};
