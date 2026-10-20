import type {
  Forecast,
  Loadable,
  Spot,
  StationReadings,
  SurfBreak,
  TideExtremes,
  TideTimeline,
} from "@repo/client/viewer/types";
import { HISTORY_DAYS, HISTORY_DAYS_MOST } from "@repo/client/viewer/wind";
import {
  type QueryClient,
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  type Nearby,
  WIND_NEARBY_KM,
  boxAround,
  nearestBuoy,
  nearestWindStation,
} from "@/components/forecast/nearby";
import { useAccount } from "@/lib/account";
import { orpc } from "@/utils/orpc";

import type { PlaceKind } from "./tabs";

// What a place's sheet reads of the API, as the web's route reads it for what is selected
// (`apps/web/src/routes/app/index.tsx`): the break, the station with its readings or the spot,
// then the forecast and the tide at its point, the buoy and the wind station near a break or a
// spot, and how big a break's waves run against the forecast. A spot of the account's own is
// asked for; one read in a list someone shared is found where that list was read.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// The week ahead, and the model's last two days to set beside what a buoy measured.
const FORECAST_DAYS = { days: 7, pastDays: 2 };
// The days of tide a sheet opens with, around today, and the most it asks for on each side.
const TIDE_DAYS = { before: 1, after: 6 };
const TIDE_DAYS_MOST = 15;

/** The time, to the minute: a sheet's figures age with it. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** What a screen knows of what a query is loading, as the web's `loadable` says it. */
export function loadable<Data>(
  query: {
    data: Data | undefined;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
  },
  // Whether what the query asks for is still to be known, as the point of a place on its way:
  // the query waits for it, and so does the screen.
  waiting = false,
): Loadable<Data> {
  // "Not found" is the API's answer when there is nothing to give. Anything else is a failure
  // to answer: the provider is down, or the network is.
  const code = (query.error as { code?: unknown } | null)?.code;
  return {
    data: query.data,
    isPending: query.isLoading || (waiting && query.data === undefined),
    isError: query.isError,
    isUnavailable: query.isError && code !== "NOT_FOUND",
  };
}

/** A spot of someone else's, as a list shared with the account holds it, where it was read. */
function spotInLists(queryClient: QueryClient, id: string): Spot | undefined {
  for (const query of queryClient.getQueryCache().getAll()) {
    const data = query.state.data as
      | { spots?: unknown; list?: { spots?: unknown } }
      | null
      | undefined;
    const spots = data?.spots ?? data?.list?.spots;
    if (!Array.isArray(spots)) continue;
    const found = (spots as Spot[]).find(
      (one) => one && typeof one === "object" && one.id === id && "latitude" in one,
    );
    if (found) return found;
  }
  return undefined;
}

/** The place itself: its name, its point and what it is, from the cache when it was read. */
export function usePlaceRecord(kind: PlaceKind, id: string) {
  const { signedIn, pending } = useAccount();
  const queryClient = useQueryClient();
  const quiet = { retry: false, meta: { quiet: true } } as const;

  // A break that has left the catalogue answers with an error, which its sheet says.
  const found = useQuery(
    orpc.v1.breaks.get.queryOptions({ input: { id }, enabled: kind === "break", ...quiet }),
  );
  // A station's sheet opens on its last two days. One that reads the wind over a week asks for
  // the week, from a moment that stays the same while the sheet is open.
  const [historyStart, setHistoryStart] = useState<Date>();
  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({
      input: { id, limit: 2000, ...(historyStart && { start: historyStart }) },
      enabled: kind === "station",
      meta: { quiet: true },
      // The days in hand stay on screen until the week comes.
      placeholderData: keepPreviousData,
    }),
  );
  // A spot read in a list someone shared is in that list. Another is asked for, and answers as
  // missing when it is not the account's.
  const listed = useMemo(
    () => (kind === "spot" ? spotInLists(queryClient, id) : undefined),
    [kind, id, queryClient],
  );
  const asked = useQuery(
    orpc.v1.spots.get.queryOptions({
      input: { id },
      enabled: kind === "spot" && signedIn && !listed,
      ...quiet,
    }),
  );
  const spot = asked.data ?? listed;
  const station: StationReadings["station"] | undefined = history.data?.station;

  const point = kind === "break" ? found.data : kind === "station" ? station : spot;
  const name = point?.name;
  const isError =
    kind === "break"
      ? found.isError
      : kind === "station"
        ? history.isError
        : !listed && !pending && (asked.isError || !signedIn);

  return {
    kind,
    id,
    name,
    point: point && { latitude: point.latitude, longitude: point.longitude },
    found: found.data as SurfBreak | undefined,
    station,
    history,
    historyDays: historyStart && !history.isPlaceholderData ? HISTORY_DAYS_MOST : HISTORY_DAYS,
    onHistoryExtend: () => {
      if (!historyStart) setHistoryStart(new Date(Date.now() - HISTORY_DAYS_MOST * 24 * HOUR_MS));
    },
    spot,
    isOwner: spot?.isOwner === true,
    isError,
    isPending:
      kind === "break"
        ? found.isLoading
        : kind === "station"
          ? history.isLoading
          : !listed && (pending || asked.isLoading),
  };
}

export type PlaceRecord = ReturnType<typeof usePlaceRecord>;

/** The sea at a place: its forecast, its tide, and the stations near it. */
export function usePlaceConditions(record: PlaceRecord, now: number) {
  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const { kind, id, point, station } = record;
  const at = { latitude: point?.latitude ?? 0, longitude: point?.longitude ?? 0 };
  // A point far from any tide station, or inland, has no tide or forecast: the sheet says so.
  const expected = { enabled: point !== undefined, retry: false, meta: { quiet: true } } as const;
  // A station that measures the wind alone shows no tide: none is asked for.
  const windAlone = station !== undefined && !station.measures.includes("waves");
  const expectedTide = { ...expected, enabled: expected.enabled && !windAlone };

  // The tide is a strip of whole days to swipe along, from midnight where the reader is.
  const [tideDays, setTideDays] = useState(TIDE_DAYS);
  const day = new Date(hour).toDateString();
  const tideSpan = useMemo(() => {
    const start = new Date(hour);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    start.setDate(start.getDate() - tideDays.before);
    end.setDate(end.getDate() + tideDays.after + 1);
    return { start, end };
    // The hour changes the span only when it passes midnight.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [day, tideDays.before, tideDays.after]);

  const tides = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: { ...at, ...tideSpan, stepMinutes: 10 },
      ...expectedTide,
      // More days of the same point keep the curve on screen until they come.
      placeholderData: keepPreviousData,
    }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { ...at, ...tideSpan },
      ...expectedTide,
      placeholderData: keepPreviousData,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({ input: { ...at, ...FORECAST_DAYS }, ...expected }),
  );

  // At a surf break or a spot, the sea is read on the nearest buoy that still reports, and the
  // wind on the nearest station that measured it lately.
  const around = kind === "station" ? undefined : point;
  const buoys = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "waves", limit: 500 },
      enabled: around !== undefined,
      // The worker fetches the buoys every few minutes.
      refetchInterval: 10 * MINUTE_MS,
      meta: { quiet: true },
      select: (answer) => answer.stations,
    }),
  );
  const windAround = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: {
        measures: "wind",
        bbox: around ? boxAround(around, WIND_NEARBY_KM) : "",
        limit: 100,
      },
      enabled: around !== undefined,
      refetchInterval: 5 * MINUTE_MS,
      meta: { quiet: true },
      select: (answer) => answer.stations,
    }),
  );
  const nearby: Nearby | undefined = useMemo(
    () => (around && buoys.data ? nearestBuoy(buoys.data, around, hour) : undefined),
    // A buoy ages with the hours, not with the minutes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [around?.latitude, around?.longitude, buoys.data, hour],
  );
  const nearbyWind: Nearby | undefined = useMemo(
    () =>
      around && windAround.data ? nearestWindStation(windAround.data, around, now) : undefined,
    // A wind ages with the answers that bring it, and with the hours when none comes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [around?.latitude, around?.longitude, windAround.data, hour],
  );
  const sizeFactor = useQuery(
    orpc.v1.breaks.sizeFactor.queryOptions({
      input: { id },
      enabled: kind === "break",
      retry: false,
      meta: { quiet: true },
    }),
  );

  // The place is on its way: what is asked at its point waits for it.
  const waiting = point === undefined && !record.isError;
  return {
    forecast: loadable<Forecast>(forecast, waiting),
    tides: loadable<TideTimeline>(tides, waiting && !windAlone),
    extremes: loadable<TideExtremes>(extremes, waiting && !windAlone),
    onTideExtend: (direction: -1 | 1) =>
      setTideDays((days) => ({
        before: Math.min(TIDE_DAYS_MOST, days.before + (direction < 0 ? 1 : 0)),
        after: Math.min(TIDE_DAYS_MOST, days.after + (direction > 0 ? 1 : 0)),
      })),
    nearby,
    nearbyWind,
    sizeFactor: sizeFactor.data,
  };
}
