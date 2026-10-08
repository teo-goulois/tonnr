import type { reading, station } from "@repo/db/schema/buoys";
import type { Effect } from "effect";

import type { UpstreamError } from "@repo/upstream";
import type { FormatError } from "./format-error";

export type StationInput = Omit<
  typeof station.$inferInsert,
  "id" | "provider" | "latestObservedAt" | "createdAt" | "updatedAt"
>;

export type ReadingInput = Omit<typeof reading.$inferInsert, "stationId" | "ingestedAt"> & {
  providerStationId: string;
};

/** What a provider publishes right now: its stations and their most recent readings. */
export type Snapshot = {
  stations: StationInput[];
  readings: ReadingInput[];
  // Rows the parser dropped because a value could not be real, such as 31 February.
  rejected: number;
};

export type Provider = {
  id: string;
  // Standard five-field cron expression, in UTC.
  schedule: string;
  fetchSnapshot: Effect.Effect<Snapshot, UpstreamError | FormatError>;
};
