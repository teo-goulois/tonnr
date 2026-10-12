import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { SharedDoor } from "@/components/lists/shared-door";
import Loader from "@/components/loader";
import { type FoundPlace, SEARCH_FROM, type SpotDraft } from "@/components/spots/new-spot-panel";
import {
  WIND_NEARBY_KM,
  boxAround,
  nearestBuoy,
  nearestWindStation,
} from "@/components/viewer/details/parts";
import { HISTORY_DAYS, HISTORY_DAYS_MOST } from "@/components/viewer/details/wind";
import type { Bounds, MapLayers, MapPoint } from "@/components/viewer/station-map";
import type {
  ListView,
  SavedBreak,
  SavedItem,
  SavedList,
  Spot,
  Station,
} from "@/components/viewer/types";
import { Viewer, type ViewerPanel } from "@/components/viewer/viewer";
import { authClient } from "@/lib/auth-client";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStoredState } from "@/lib/use-stored-state";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

import { useAlerting } from "./-alerting";
import { useSharedList } from "./-shared";

export const Route = createFileRoute("/app/")({
  validateSearch: z.object({
    // The station, the surf break or the spot whose panel is open. One is selected, never two.
    station: z.string().optional(),
    break: z.string().optional(),
    spot: z.string().optional(),
    // "add" is the panel that adds a spot.
    panel: z.enum(["saved", "alerts", "add"]).optional(),
    // The part of the alerts panel in view: what was told when left out.
    alerts: z.enum(["mine", "settings"]).optional(),
    // The buoy opened from a surf break, over the break's panel.
    buoy: z.string().optional(),
    // The list the map shows alone: one of the account's or one it kept, by its id, or one that
    // is opened by its link, by what the link ends with. Decision 035.
    list: z.string().optional(),
    shared: z.string().optional(),
  }),
  component: AppRoute,
});

/** A list opened by its link, and what keeping it for an account takes. */
type SharedList = {
  token: string;
  list: ListView;
  password: string | undefined;
  pass: string | null;
};

function AppRoute() {
  const { shared } = Route.useSearch();
  const session = authClient.useSession();
  if (!shared) return <ViewerRoute />;
  // Whether an account reads the link is known before it is opened: an account opens it with
  // its session, and a visitor with the link alone.
  if (session.isPending) return <Loader />;
  return <SharedRoute key={shared} token={shared} signedIn={Boolean(session.data)} />;
}

/** The map with the list a link opens, once the link has opened it. */
function SharedRoute({ token, signedIn }: { token: string; signedIn: boolean }) {
  const door = useSharedList(token, signedIn);
  const navigate = Route.useNavigate();
  // An account that owns the list, or kept it, reads it as one of its own.
  const own = door.list && door.list.access !== "link" ? door.list.id : undefined;
  useEffect(() => {
    if (own) void navigate({ search: { list: own, panel: "saved" }, replace: true });
  }, [own, navigate]);

  if (!door.list || own) {
    return (
      <SharedDoor
        state={door.state === "open" ? "opening" : door.state}
        refusal={door.refusal}
        isChecking={door.isChecking}
        onPassword={door.onPassword}
        onRetry={door.onRetry}
      />
    );
  }
  return (
    <ViewerRoute shared={{ token, list: door.list, password: door.password, pass: door.pass }} />
  );
}

// What a panel reads of the model: the week ahead, and the two days before now.
const FORECAST_DAYS = { days: 7, pastDays: 2 };
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// The days of tide a panel opens with, around today: yesterday and the six days after. Scrolled
// to an end, the strip asks for one more, up to what the API gives in one answer.
const TIDE_DAYS = { before: 1, after: 6 };
const TIDE_DAYS_MOST = 15;
const WIND_LIMIT = 500;
const BREAK_LIMIT = 1000;
const DEFAULT_LAYERS: MapLayers = { sea: true, buoys: true, wind: false, breaks: true };
// How many spots an account holds, as the API says when it refuses one more.
const SPOTS_MOST = 100;
// How long the search waits after the last key before it asks, and how many it shows of each kind.
const SEARCH_WAIT_MS = 300;
const SEARCH_LIMIT = 5;
// A spot this close to the marker is the same place, as far as a warning goes.
const SAME_PLACE_METERS = 150;
const NO_DRAFT: SpotDraft = { name: "", point: null };

// The distance between two points near one another, in meters, on a flat earth: enough to say
// whether they are the same beach.
function metersBetween(one: MapPoint, other: MapPoint) {
  const perDegree = 111_320;
  const north = (one.latitude - other.latitude) * perDegree;
  // The short way round: 179.999 and -179.999 are neighbours.
  const turned = ((((one.longitude - other.longitude + 180) % 360) + 360) % 360) - 180;
  const east = turned * perDegree * Math.cos((one.latitude * Math.PI) / 180);
  return Math.hypot(north, east);
}

// The middle of what the map shows, and how close the map is: the zoom at which the world is as
// many times wider than the view. None for a view that crosses the antimeridian.
function middleOf(bounds: Bounds | null) {
  if (!bounds) return undefined;
  const [west, south, east, north] = bounds;
  if (west >= east) return undefined;
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    zoom: Math.round(Math.max(0, Math.min(22, Math.log2(360 / (east - west))))),
  };
}

function readLayers(stored: unknown): MapLayers | null {
  if (typeof stored !== "object" || stored === null) return null;
  const { sea, buoys, wind, breaks } = stored as Record<string, unknown>;
  return typeof sea === "boolean" && typeof buoys === "boolean" && typeof wind === "boolean"
    ? // A choice kept from before the breaks were on the map says nothing of them.
      { sea, buoys, wind, breaks: typeof breaks === "boolean" ? breaks : DEFAULT_LAYERS.breaks }
    : null;
}

// The current time, updated every minute, so that a reading ages while the page stays open.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// What a query gives a screen. A query that is switched off is not loading anything.
function loadable<Data>(query: {
  data: Data | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  // "Not found" is the API's answer when there is nothing to give. Anything else is a failure
  // to answer: the provider is down, or the network is.
  const code = (query.error as { code?: unknown } | null)?.code;
  return {
    data: query.data,
    isPending: query.isLoading,
    isError: query.isError,
    isUnavailable: query.isError && code !== "NOT_FOUND",
  };
}

function ViewerRoute({ shared }: { shared?: SharedList }) {
  const search = Route.useSearch();
  const { panel } = search;
  // An empty value selects nothing, and a station wins over a break given with it.
  const selectedId = search.station || undefined;
  const selectedBreakId = selectedId ? undefined : search.break || undefined;
  const selectedSpotId = selectedId || selectedBreakId ? undefined : search.spot || undefined;
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const wide = useMediaQuery("(min-width: 1024px)");
  const now = useNow();
  // Rounded to the hour so the query keys stay the same from one minute to the next.
  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [tideReach, setTideReach] = useState({ of: "", ...TIDE_DAYS });
  // A station's panel opens on its last two days. One that reads the wind over a week asks for
  // the week, from a moment that stays the same while the station is open.
  const [historyReach, setHistoryReach] = useState<{ of: string; start: Date }>();
  const [layers, setLayers] = useStoredState("tonnr:map-layers", DEFAULT_LAYERS, readLayers);
  const session = authClient.useSession();
  const signedIn = Boolean(session.data);

  const waves = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "waves", limit: 500 },
      refetchInterval: 10 * MINUTE_MS,
      select: (answer) => answer.stations,
    }),
  );
  // Wind stations are many, so only the ones in view are loaded.
  const wind = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "wind", bbox: bounds?.join(",") ?? "", limit: WIND_LIMIT },
      enabled: layers.wind && bounds !== null,
      placeholderData: keepPreviousData,
      // The worker fetches the wind every ten minutes.
      refetchInterval: 5 * MINUTE_MS,
      select: (answer) => answer.stations,
    }),
  );
  const breaks = useQuery(
    orpc.v1.breaks.list.queryOptions({
      input: { bbox: bounds?.join(",") ?? "", limit: BREAK_LIMIT },
      enabled: layers.breaks && bounds !== null,
      placeholderData: keepPreviousData,
      // The catalogue changes when its operator adds to it by hand.
      staleTime: 60 * MINUTE_MS,
      // Without them the map shows the stations alone, which needs no message.
      meta: { quiet: true },
    }),
  );
  const sea = useQuery(
    orpc.v1.maps.waveHeight.queryOptions({
      enabled: layers.sea,
      staleTime: 30 * MINUTE_MS,
      retry: 1,
      // Without it the map shows the buoys alone, which needs no message.
      meta: { quiet: true },
    }),
  );

  const lists = useQuery(
    orpc.v1.lists.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.lists,
      meta: { quiet: true },
    }),
  );
  // The lists of others that the account kept: the same answer, read for them.
  const joined = useQuery(
    orpc.v1.lists.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.joined,
      meta: { quiet: true },
    }),
  );
  // The list the map shows alone: the one a link opened, or one the account reads by its id.
  const listId = shared ? undefined : search.list || undefined;
  const askedList = useQuery(
    orpc.v1.lists.view.queryOptions({
      input: { id: listId ?? "" },
      enabled: signedIn && listId !== undefined,
      retry: false,
      meta: { quiet: true },
    }),
  );
  const listView = shared?.list ?? (listId ? askedList.data : undefined);
  // What every address of the map keeps while a list is shown alone.
  const mode = shared ? { shared: shared.token } : listId ? { list: listId } : {};
  // A list that was deleted, or that its owner shares no more, gives the whole map back.
  const listGone = listId !== undefined && askedList.isError;
  useEffect(() => {
    if (!listGone) return;
    toast.error(m.list_gone());
    void navigate({ search: (previous) => ({ ...previous, list: undefined }), replace: true });
  }, [listGone, navigate]);
  const spots = useQuery(
    orpc.v1.spots.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.spots,
      meta: { quiet: true },
    }),
  );
  const notifications = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: { limit: 50 },
      enabled: signedIn && panel === "alerts",
      select: (answer) => answer.notifications,
      meta: { quiet: true },
    }),
  );

  // The settings are read where they show: in the alerts panel, and in the panel of a spot.
  const alerting = useAlerting({
    signedIn,
    isShown: panel === "alerts" || selectedSpotId !== undefined,
  });

  const loaded = useMemo(() => {
    const byId = new Map<string, Station>();
    for (const station of wind.data ?? []) byId.set(station.id, station);
    for (const station of waves.data ?? []) byId.set(station.id, station);
    return byId;
  }, [waves.data, wind.data]);

  // A saved station that is neither a buoy nor a wind station in view is fetched on its own.
  const savedIds = useMemo(
    () => [
      ...new Set([
        ...(lists.data ?? []).flatMap((list) => list.stationIds),
        ...(listView?.stationIds ?? []),
      ]),
    ],
    [lists.data, listView?.stationIds],
  );
  const missingIds = waves.isSuccess ? savedIds.filter((id) => !loaded.has(id)) : [];
  const missing = useQueries({
    queries: missingIds.map((id) =>
      orpc.v1.stations.get.queryOptions({ input: { id }, meta: { quiet: true } }),
    ),
  });
  const savedStations = useMemo(() => {
    const byId = new Map<string, Station>();
    for (const id of savedIds) {
      const station = loaded.get(id);
      if (station) byId.set(id, station);
    }
    for (const query of missing) {
      if (query.data) byId.set(query.data.id, query.data);
    }
    return byId;
    // The answers themselves say when the list of queries has something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds, loaded, missing.map((query) => query.dataUpdatedAt).join()]);

  // A saved break that is not among those in view is fetched on its own, as a saved station is.
  const savedBreakIds = useMemo(
    () => [
      ...new Set([
        ...(lists.data ?? []).flatMap((list) => list.breakIds),
        ...(listView?.breakIds ?? []),
      ]),
    ],
    [lists.data, listView?.breakIds],
  );
  const breaksInView = breaks.data?.breaks;
  const missingBreaks = useQueries({
    queries: savedBreakIds
      .filter((id) => !breaksInView?.some((candidate) => candidate.id === id))
      .map((id) =>
        orpc.v1.breaks.get.queryOptions({ input: { id }, retry: false, meta: { quiet: true } }),
      ),
  });
  const savedBreaks = useMemo(() => {
    const byId = new Map<string, SavedBreak>();
    for (const candidate of breaksInView ?? []) {
      if (savedBreakIds.includes(candidate.id)) byId.set(candidate.id, candidate);
    }
    for (const query of missingBreaks) {
      if (query.data) byId.set(query.data.id, query.data);
    }
    return byId;
    // The answers themselves say when the list of queries has something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedBreakIds, breaksInView, missingBreaks.map((query) => query.dataUpdatedAt).join()]);

  const historyStart =
    historyReach && historyReach.of === selectedId ? historyReach.start : undefined;
  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({
      input: {
        id: selectedId ?? "",
        limit: 2000,
        ...(historyStart && { start: historyStart }),
      },
      enabled: selectedId !== undefined,
      meta: { quiet: true },
      // The days in hand of the same station stay on screen until its week comes.
      placeholderData: (previous) => (previous?.station.id === selectedId ? previous : undefined),
    }),
  );
  const historyDays = historyStart && !history.isPlaceholderData ? HISTORY_DAYS_MOST : HISTORY_DAYS;
  // The map already knows where most stations are, so their forecast and tide load with their
  // history, not after it.
  const known = selectedId ? (loaded.get(selectedId) ?? savedStations.get(selectedId)) : undefined;
  // A break that has left the catalogue answers with an error, which its panel says.
  const found = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: selectedBreakId ?? "" },
      enabled: selectedBreakId !== undefined,
      retry: false,
      meta: { quiet: true },
    }),
  );
  // A spot of the account's own is in its list. A spot of someone else's is read in the list
  // they shared it by. Another is asked for, and answers as missing when it is not the
  // account's.
  const ownSpot = selectedSpotId
    ? spots.data?.find((candidate) => candidate.id === selectedSpotId)
    : undefined;
  const listSpot = selectedSpotId
    ? listView?.spots.find((candidate) => candidate.id === selectedSpotId)
    : undefined;
  const askedSpot = useQuery(
    orpc.v1.spots.get.queryOptions({
      input: { id: selectedSpotId ?? "" },
      // An account's list comes first: it says at once whether the spot is one of its own. A
      // visitor has no spot to ask for.
      enabled:
        signedIn && selectedSpotId !== undefined && !ownSpot && !listSpot && !spots.isLoading,
      retry: false,
      meta: { quiet: true },
    }),
  );
  // An answer kept from before does not stand against the API now saying that there is none.
  const spot =
    ownSpot ?? listSpot ?? (selectedSpotId && !askedSpot.isError ? askedSpot.data : undefined);
  const isSelected = (candidate: { id: string }) => candidate.id === selectedBreakId;
  const placed =
    known ??
    history.data?.station ??
    (selectedBreakId ? (breaks.data?.breaks.find(isSelected) ?? found.data) : spot);
  const point = placed && { latitude: placed.latitude, longitude: placed.longitude };
  const atPoint = { latitude: point?.latitude ?? 0, longitude: point?.longitude ?? 0 };
  // A point far from any tide station, or inland, has no tide or forecast: the panel says so.
  const expected = { enabled: point !== undefined, retry: false, meta: { quiet: true } };
  // A station that measures the wind alone shows no tide: none is asked for.
  const selectedStation = selectedId ? (known ?? history.data?.station) : undefined;
  const windAlone = selectedStation !== undefined && !selectedStation.measures.includes("waves");
  const expectedTide = { ...expected, enabled: expected.enabled && !windAlone };

  // The tide is a strip of whole days to scroll along, from midnight where the user is.
  // The days asked for belong to what is selected: another selection opens on its first days.
  const selection = selectedId ?? selectedBreakId ?? selectedSpotId ?? "";
  const tideDays = tideReach.of === selection ? tideReach : TIDE_DAYS;
  const tideSpan = useMemo(() => {
    const start = new Date(hour);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    start.setDate(start.getDate() - tideDays.before);
    end.setDate(end.getDate() + tideDays.after + 1);
    return { start, end };
    // The hour changes the span only when it passes midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [new Date(hour).toDateString(), tideDays.before, tideDays.after]);
  // More days of the same point keep the curve on screen until they come. The point a query
  // asked for is the input in its key.
  const keepAtPoint = {
    placeholderData: <Answer,>(previous: Answer | undefined, asked?: { queryKey: unknown }) => {
      const key = asked?.queryKey as [unknown, { input?: typeof atPoint }] | undefined;
      const input = key?.[1].input;
      return input?.latitude === atPoint.latitude && input.longitude === atPoint.longitude
        ? previous
        : undefined;
    },
  };
  const tides = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: { ...atPoint, ...tideSpan, stepMinutes: 10 },
      ...expectedTide,
      ...keepAtPoint,
    }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { ...atPoint, ...tideSpan },
      ...expectedTide,
      ...keepAtPoint,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({
      // The week ahead, and the model's last two days to set beside what a buoy measured.
      input: { ...atPoint, ...FORECAST_DAYS },
      ...expected,
    }),
  );

  // At a surf break or a spot, the sea is read on the nearest buoy that still reports. The map's
  // list holds the buoys already.
  const breakPoint = selectedBreakId || selectedSpotId ? point : undefined;
  const nearby = useMemo(
    () => (breakPoint && waves.data ? nearestBuoy(waves.data, breakPoint, hour) : undefined),
    // A buoy ages with the hours, not with the minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakPoint?.latitude, breakPoint?.longitude, waves.data, hour],
  );
  // The wind there is read on the nearest station that measured it lately. Wind stations are
  // many, and the map holds only those in view: the ones around the point are asked for.
  const windAround = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: {
        measures: "wind",
        bbox: breakPoint ? boxAround(breakPoint, WIND_NEARBY_KM) : "",
        limit: 100,
      },
      enabled: breakPoint !== undefined,
      // The worker fetches the wind every few minutes.
      refetchInterval: 5 * MINUTE_MS,
      meta: { quiet: true },
      select: (answer) => answer.stations,
    }),
  );
  const nearbyWind = useMemo(
    () =>
      breakPoint && windAround.data
        ? nearestWindStation(windAround.data, breakPoint, now)
        : undefined,
    // A wind ages with the answers that bring it, and with the hours when none comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakPoint?.latitude, breakPoint?.longitude, windAround.data, hour],
  );
  // That buoy opens over the break, and the address names it. It is loaded as a selected station
  // is, on the days of tide the break is shown.
  const buoyId = selectedBreakId || selectedSpotId ? search.buoy : undefined;
  const buoyHistory = useQuery(
    orpc.v1.stations.readings.queryOptions({
      input: { id: buoyId ?? "", limit: 2000 },
      enabled: buoyId !== undefined,
      meta: { quiet: true },
    }),
  );
  const buoyKnown = buoyId ? loaded.get(buoyId) : undefined;
  const buoyPlaced = buoyKnown ?? buoyHistory.data?.station;
  const atBuoy = { latitude: buoyPlaced?.latitude ?? 0, longitude: buoyPlaced?.longitude ?? 0 };
  const expectedAtBuoy = { ...expected, enabled: buoyPlaced !== undefined };
  const buoyForecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({
      input: { ...atBuoy, ...FORECAST_DAYS },
      ...expectedAtBuoy,
    }),
  );
  const buoyTides = useQuery(
    orpc.v1.tides.timeline.queryOptions({
      input: { ...atBuoy, ...tideSpan, stepMinutes: 10 },
      ...expectedAtBuoy,
    }),
  );
  const buoyExtremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { ...atBuoy, ...tideSpan },
      ...expectedAtBuoy,
    }),
  );

  const listsKey = orpc.v1.lists.list.queryKey();
  const setLists = (update: (lists: SavedList[]) => SavedList[]) =>
    queryClient.setQueryData(listsKey, (answer) => ({
      lists: update(answer?.lists ?? []),
      joined: answer?.joined ?? [],
    }));
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: listsKey });
  const replaceList = (list: SavedList) =>
    setLists((all) =>
      all.some((other) => other.id === list.id)
        ? all.map((other) => (other.id === list.id ? list : other))
        : // The favorites the star had drawn before the account had any.
          [list, ...all.filter((other) => other.id !== "favorites")],
    );

  const addStation = useMutation(
    orpc.v1.lists.addStation.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  const removeStation = useMutation(
    orpc.v1.lists.removeStation.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  const addBreak = useMutation(
    orpc.v1.lists.addBreak.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  const removeBreak = useMutation(
    orpc.v1.lists.removeBreak.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  const addSpot = useMutation(
    orpc.v1.lists.addSpot.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  const removeSpotFromList = useMutation(
    orpc.v1.lists.removeSpot.mutationOptions({
      onSuccess: replaceList,
      onError: (error) => {
        toast.error(error.message);
        void refreshLists();
      },
    }),
  );
  // Sharing a list answers with the list as it is then.
  const sharing = {
    onSuccess: replaceList,
    onError: (error: Error) => {
      toast.error(error.message);
      void refreshLists();
    },
  };
  const shareList = useMutation(orpc.v1.lists.share.mutationOptions(sharing));
  const renewShare = useMutation(
    orpc.v1.lists.renewShare.mutationOptions({
      ...sharing,
      onSuccess: (list) => {
        replaceList(list);
        toast.success(m.share_renewed());
      },
    }),
  );
  const unshareList = useMutation(
    orpc.v1.lists.unshare.mutationOptions({
      ...sharing,
      onSuccess: (list) => {
        replaceList(list);
        toast.success(m.share_stopped());
      },
    }),
  );
  // Keeping a list a link opened makes it one the account reads by its id.
  const keepList = useMutation(
    orpc.v1.shared.join.mutationOptions({
      onSuccess: async ({ id }) => {
        await refreshLists();
        toast.success(m.list_kept_toast());
        void navigate({ search: { list: id, panel: "saved" } });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const leaveList = useMutation(
    orpc.v1.lists.leave.mutationOptions({
      onSuccess: async () => {
        await refreshLists();
        void navigate({ search: { panel: "saved" } });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const createList = useMutation(
    orpc.v1.lists.create.mutationOptions({
      onSuccess: (list) => setLists((all) => [...all, list]),
      onError: (error) => toast.error(error.message),
    }),
  );
  const deleteList = useMutation(
    orpc.v1.lists.delete.mutationOptions({
      onSuccess: ({ id }) => setLists((all) => all.filter((list) => list.id !== id)),
      onError: (error) => toast.error(error.message),
    }),
  );
  const markRead = useMutation(
    orpc.v1.notifications.markRead.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.v1.notifications.key() }),
      onError: (error) => toast.error(error.message),
    }),
  );

  // Adding a spot: what is typed to find the place, and the spot as far as it has got. Both stay
  // when the panel closes, so that a spot the API refused is not to be made again.
  const isAdding = panel === "add" && signedIn;
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(NO_DRAFT);
  // The name the search or the catalogue gave the draft. A name the user wrote is not replaced.
  const [suggested, setSuggested] = useState("");
  // What the search asks, once the keys have stopped, and where the map was then.
  const [asked, setAsked] = useState<{ q: string; near: ReturnType<typeof middleOf> }>({
    q: "",
    near: undefined,
  });
  const middle = middleOf(bounds);
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(() => setAsked({ q, near: middle }), SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
    // The map moving asks nothing again: a search is made from where the map was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  // Only what is still typed is searched and shown: a search cleared, or typed further, shows no
  // old answer. While the keys have not stopped, the answer is on its way.
  const typed = query.trim();
  const isSearchable = isAdding && typed.length >= SEARCH_FROM;
  const isSearching = isSearchable && asked.q === typed;
  const isWaiting = isSearchable && asked.q !== typed;
  const foundPlaces = useQuery(
    orpc.v1.places.search.queryOptions({
      input: { q: asked.q, ...asked.near, locale: getLocale(), limit: SEARCH_LIMIT },
      enabled: isSearching,
      // The API asks a service that is not the instance's: one request for a search, and no more.
      retry: false,
      staleTime: 10 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  const foundBreaks = useQuery(
    orpc.v1.breaks.list.queryOptions({
      input: { q: asked.q, limit: SEARCH_LIMIT },
      enabled: isSearching,
      staleTime: 60 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  const searched = useMemo(
    () => ({
      breaks: {
        data: isSearching
          ? foundBreaks.data?.breaks.map((candidate): FoundPlace => ({
              name: candidate.name,
              location: candidate.location ?? [],
              latitude: candidate.latitude,
              longitude: candidate.longitude,
              breakId: candidate.id,
            }))
          : undefined,
        isPending: isWaiting || (isSearching && foundBreaks.isLoading),
        isError: isSearching && foundBreaks.isError,
      },
      places: {
        data: isSearching ? foundPlaces.data?.places : undefined,
        isPending: isWaiting || (isSearching && foundPlaces.isLoading),
        isError: isSearching && foundPlaces.isError,
      },
      credit: isSearching ? foundPlaces.data?.source.attribution : undefined,
    }),
    [
      isSearching,
      isWaiting,
      foundBreaks.data,
      foundBreaks.isLoading,
      foundBreaks.isError,
      foundPlaces.data,
      foundPlaces.isLoading,
      foundPlaces.isError,
    ],
  );
  // The name follows what the marker is put on, until the user writes one.
  const nameFor = (current: SpotDraft, name: string | undefined) =>
    name && (!current.name.trim() || current.name === suggested) ? name.slice(0, 80) : undefined;
  function pick(found: FoundPlace) {
    const name = nameFor(draft, found.name);
    if (name) setSuggested(name);
    setDraft({
      name: name ?? draft.name,
      point: { latitude: found.latitude, longitude: found.longitude },
      breakId: found.breakId,
    });
    setQuery("");
  }
  function place(at: MapPoint, breakId?: string) {
    const on = breakId ? breaks.data?.breaks.find((one) => one.id === breakId) : undefined;
    const name = nameFor(draft, on?.name);
    if (name) setSuggested(name);
    setDraft({ name: name ?? draft.name, point: at, breakId });
  }
  const draftPoint = draft.point;
  const near = draftPoint
    ? spots.data?.find((one) => metersBetween(one, draftPoint) < SAME_PLACE_METERS)
    : undefined;

  const spotsKey = orpc.v1.spots.list.queryKey();
  // The list on the screen changes at once. A request for it that was on its way would bring
  // back the list as it was: it is dropped, and the list is asked for again.
  const setSpots = async (update: (all: Spot[]) => Spot[]) => {
    await queryClient.cancelQueries({ queryKey: spotsKey });
    queryClient.setQueryData(spotsKey, (answer) => ({ spots: update(answer?.spots ?? []) }));
    void queryClient.invalidateQueries({ queryKey: spotsKey });
  };
  // The spot that was just added: its panel offers to describe it, until the offer is answered.
  const [madeId, setMadeId] = useState<string>();
  // What is on the screen when an answer comes, which may be long after it was asked for.
  const onScreen = useRef({ panel, selectedSpotId });
  onScreen.current = { panel, selectedSpotId };
  const createSpot = useMutation(
    orpc.v1.spots.create.mutationOptions({
      onSuccess: (made) => {
        void setSpots((all) => [...all.filter((one) => one.id !== made.id), made]);
        setDraft(NO_DRAFT);
        setSuggested("");
        setQuery("");
        toast.success(m.spot_saved({ name: made.name }));
        setMadeId(made.id);
        // The spot opens, unless the user has gone elsewhere meanwhile.
        if (onScreen.current.panel === "add") void navigate({ search: { spot: made.id } });
      },
      // The draft stays as it was: the panel is still open on it.
      onError: (error) => toast.error(error.message),
    }),
  );
  // A spot that was shared becomes one of the reader's own, with what was said of it.
  const copySpot = useMutation(
    orpc.v1.spots.create.mutationOptions({
      onSuccess: (made) => {
        void setSpots((all) => [...all.filter((one) => one.id !== made.id), made]);
        toast.success(m.spot_saved({ name: made.name }));
        void navigate({ search: { spot: made.id } });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const deleteSpot = useMutation(
    orpc.v1.spots.delete.mutationOptions({
      onSuccess: ({ id }) => {
        void setSpots((all) => all.filter((one) => one.id !== id));
        // The spot left the lists it was in.
        setLists((all) =>
          all.map((list) =>
            list.spotIds.includes(id)
              ? { ...list, spotIds: list.spotIds.filter((other) => other !== id) }
              : list,
          ),
        );
        // What was kept of the spot alone goes too: its address would show it again.
        queryClient.removeQueries({ queryKey: orpc.v1.spots.get.queryKey({ input: { id } }) });
        // Its panel closes, unless another was opened meanwhile.
        // The spot is gone, and with it whatever was being written of its alerts: no one is
        // asked whether to leave it.
        if (onScreen.current.selectedSpotId === id) {
          void navigate({ search: mode, ignoreBlocker: true });
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const describeSpot = useMutation(
    orpc.v1.spots.update.mutationOptions({
      onSuccess: (updated) => {
        // The spot as it was asked for alone, when its list could not be had, and in its list.
        queryClient.setQueryData(
          orpc.v1.spots.get.queryKey({ input: { id: updated.id } }),
          updated,
        );
        void setSpots((all) => all.map((one) => (one.id === updated.id ? updated : one)));
        toast.success(m.spot_guide_saved());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  // Renaming a spot, moving it, and what is asked about making it public all answer with the
  // spot as it is then: it takes its place wherever the spot is kept.
  const keepSpot = (updated: Spot) => {
    queryClient.setQueryData(orpc.v1.spots.get.queryKey({ input: { id: updated.id } }), updated);
    void setSpots((all) => all.map((one) => (one.id === updated.id ? updated : one)));
  };
  const changeSpot = useMutation(
    orpc.v1.spots.update.mutationOptions({
      onSuccess: (updated) => {
        keepSpot(updated);
        // A spot that moved has another sea: what an alert was tried at there is tried again.
        void queryClient.invalidateQueries({ queryKey: orpc.v1.alerts.preview.key() });
        toast.success(m.spot_changed({ name: updated.name }));
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const askPublication = useMutation(
    orpc.v1.spots.requestPublication.mutationOptions({
      onSuccess: (updated) => {
        keepSpot(updated);
        toast.success(m.spot_publish_sent());
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const cancelPublication = useMutation(
    orpc.v1.spots.cancelPublication.mutationOptions({
      onSuccess: (updated) => {
        keepSpot(updated);
        toast.success(m.spot_publish_cancelled());
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function saveSpot() {
    const name = draft.name.trim();
    if (!draft.point || !name || createSpot.isPending) return;
    // A marker left on the break it was put on makes a spot from that break, which the API then
    // places itself. Moved, it is a point of the user's own.
    createSpot.mutate(draft.breakId ? { breakId: draft.breakId, name } : { name, ...draft.point });
  }
  function removeSpot(one: Spot) {
    if (deleteSpot.isPending) return;
    deleteSpot.mutate(
      { id: one.id },
      { onSuccess: () => toast.success(m.spot_deleted({ name: one.name })) },
    );
  }

  // The star answers at once: the list changes on the screen, then the API confirms it.
  function save(listId: string, item: SavedItem, add: boolean) {
    // The ids of the item's kind once it is added to them or taken out.
    const changed = (ids: string[], id: string) =>
      add ? [...ids.filter((other) => other !== id), id] : ids.filter((other) => other !== id);
    const withItem = (list: Pick<SavedList, "stationIds" | "breakIds" | "spotIds">) =>
      "spotId" in item
        ? { spotIds: changed(list.spotIds, item.spotId) }
        : "breakId" in item
          ? { breakIds: changed(list.breakIds, item.breakId) }
          : { stationIds: changed(list.stationIds, item.stationId) };
    setLists((all) => {
      const isTarget = (list: SavedList) =>
        listId === "favorites" ? list.isDefault : list.id === listId;
      if (!all.some(isTarget) && listId === "favorites" && add) {
        const today = new Date();
        return [
          {
            id: "favorites",
            name: "",
            isDefault: true,
            stationIds: [],
            breakIds: [],
            spotIds: [],
            share: null,
            ...withItem({ stationIds: [], breakIds: [], spotIds: [] }),
            createdAt: today,
            updatedAt: today,
          },
          ...all,
        ];
      }
      return all.map((list) => (isTarget(list) ? { ...list, ...withItem(list) } : list));
    });
    if ("spotId" in item) {
      (add ? addSpot : removeSpotFromList).mutate({ id: listId, spotId: item.spotId });
    } else if ("breakId" in item) {
      (add ? addBreak : removeBreak).mutate({ id: listId, breakId: item.breakId });
    } else {
      (add ? addStation : removeStation).mutate({ id: listId, stationId: item.stationId });
    }
    if (listId === "favorites" && add) toast.success(m.saved_added_to_favorites());
  }

  // The map redraws the breaks when the list changes, so it is given the same one until then.
  const mapBreaks = useMemo(() => breaks.data?.breaks ?? [], [breaks.data]);
  // A list shown alone gives the map its stations and its breaks, in place of those in view,
  // whatever the layers say: nothing else is drawn.
  const listStations = useMemo(
    () => listView?.stationIds.flatMap((id) => savedStations.get(id) ?? []),
    [listView?.stationIds, savedStations],
  );
  const listBreaks = useMemo(
    () => listView?.breakIds.flatMap((id) => savedBreaks.get(id) ?? []),
    [listView?.breakIds, savedBreaks],
  );
  const listWaves = useMemo(
    () => listStations?.filter((station) => station.measures.includes("waves")),
    [listStations],
  );
  const listWind = useMemo(
    () => listStations?.filter((station) => !station.measures.includes("waves")),
    [listStations],
  );

  return (
    <Viewer
      now={now}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      wide={wide}
      waveStations={
        listWaves ? { data: listWaves, isPending: false, isError: false } : loadable(waves)
      }
      windStations={listWind ?? wind.data ?? []}
      windTruncated={!listView && wind.data?.length === WIND_LIMIT}
      breaks={listBreaks ?? mapBreaks}
      breaksTruncated={!listView && breaks.data?.next != null}
      sea={sea.data}
      layers={listView ? { ...layers, buoys: true, wind: true, breaks: true } : layers}
      listView={listView}
      joined={joined.data ?? []}
      onViewList={(id) => void navigate({ search: { list: id, panel: "saved" } })}
      onExitList={shared ? undefined : () => void navigate({ search: { panel: "saved" } })}
      onKeepList={() =>
        shared &&
        keepList.mutate({
          token: shared.token,
          ...(shared.password !== undefined && { password: shared.password }),
          ...(shared.pass !== null && { pass: shared.pass }),
        })
      }
      isKeepingList={keepList.isPending}
      onLeaveList={() => listView && leaveList.mutate({ id: listView.id })}
      sharing={{
        isSaving: shareList.isPending || renewShare.isPending || unshareList.isPending,
        onShare: (list, password) =>
          shareList.mutate({ id: list.id, ...(password !== undefined && { password }) }),
        onRenew: (list) => renewShare.mutate({ id: list.id }),
        onStop: (list) => unshareList.mutate({ id: list.id }),
      }}
      onCopySpot={(one) => {
        const said = Object.fromEntries(
          Object.entries(one.characteristics).filter(([, value]) => value !== null),
        );
        copySpot.mutate({
          name: one.name,
          latitude: one.latitude,
          longitude: one.longitude,
          ...(Object.keys(said).length > 0 && { characteristics: said }),
        });
      }}
      isCopyingSpot={copySpot.isPending}
      spots={loadable(spots)}
      selectedId={selectedId}
      selectedBreakId={selectedBreakId}
      selectedSpotId={selectedSpotId}
      selected={{
        station: known,
        history: loadable(history),
        historyDays,
        found: loadable(found),
        spot: {
          data: spot,
          isPending: !spot && (askedSpot.isLoading || (signedIn && spots.isLoading)),
          isError: !spot && askedSpot.isError,
        },
        forecast: loadable(forecast),
        tides: loadable(tides),
        extremes: loadable(extremes),
        nearby,
        nearbyWind,
      }}
      buoy={{
        id: buoyId,
        station: buoyKnown,
        history: loadable(buoyHistory),
        forecast: loadable(buoyForecast),
        tides: loadable(buoyTides),
        extremes: loadable(buoyExtremes),
      }}
      onOpenBuoy={(buoy) => void navigate({ search: (previous) => ({ ...previous, buoy }) })}
      onHistoryExtend={() => {
        if (selectedId && historyReach?.of !== selectedId) {
          setHistoryReach({
            of: selectedId,
            start: new Date(hour - HISTORY_DAYS_MOST * 24 * HOUR_MS),
          });
        }
      }}
      onTideExtend={(direction) =>
        setTideReach({
          of: selection,
          before: Math.min(TIDE_DAYS_MOST, tideDays.before + (direction < 0 ? 1 : 0)),
          after: Math.min(TIDE_DAYS_MOST, tideDays.after + (direction > 0 ? 1 : 0)),
        })
      }
      panel={panel}
      signedIn={signedIn}
      lists={loadable(lists)}
      savedStations={savedStations}
      savedBreaks={savedBreaks}
      notifications={loadable(notifications)}
      alerting={alerting}
      alertsTab={search.alerts ?? "news"}
      onAlertsTabChange={(tab) =>
        void navigate({
          search: (previous) => ({ ...previous, alerts: tab === "news" ? undefined : tab }),
          replace: true,
        })
      }
      onLayersChange={setLayers}
      adding={{
        query,
        search: searched,
        draft,
        near: near && { id: near.id, name: near.name },
        isFull: (spots.data?.length ?? 0) >= SPOTS_MOST,
        isSaving: createSpot.isPending,
        onQueryChange: setQuery,
        onPick: pick,
        onPlace: place,
        onNameChange: (name) => setDraft((current) => ({ ...current, name })),
        onSave: saveSpot,
      }}
      onSelect={(station) => void navigate({ search: { ...mode, station } })}
      onSelectBreak={(id) => void navigate({ search: { ...mode, break: id } })}
      onSelectSpot={(id) => void navigate({ search: { ...mode, spot: id } })}
      onDeleteSpot={removeSpot}
      isDeletingSpot={deleteSpot.isPending}
      onChangeSpot={(one, change, done) =>
        changeSpot.mutate({ id: one.id, ...change }, { onSuccess: done })
      }
      isChangingSpot={changeSpot.isPending}
      onPublishSpot={(one, note, done) =>
        askPublication.mutate({ id: one.id, ...(note ? { note } : {}) }, { onSuccess: done })
      }
      onCancelPublication={(one) => cancelPublication.mutate({ id: one.id })}
      isAskingPublication={askPublication.isPending || cancelPublication.isPending}
      newSpotId={madeId}
      onSpotOfferSeen={() => setMadeId(undefined)}
      onDescribeSpot={(one, said, done) =>
        describeSpot.mutate({ id: one.id, characteristics: said }, { onSuccess: done })
      }
      isDescribingSpot={describeSpot.isPending}
      // A panel opens over the station's and gives it back when it closes. The one that adds a
      // spot stands alone: the map beside it is for the marker.
      onPanelChange={(next: ViewerPanel | undefined) =>
        void navigate({
          search: (previous) => (next === "add" ? { panel: next } : { ...previous, panel: next }),
        })
      }
      onBoundsChange={setBounds}
      onSave={save}
      onCreateList={(name, item) =>
        createList.mutate(
          { name },
          // A list made from something's menu holds it from the start.
          { onSuccess: (list) => item && save(list.id, item, true) },
        )
      }
      onDeleteList={(list) => deleteList.mutate({ id: list.id })}
      onReadNotification={(notification) => markRead.mutate({ id: notification.id })}
    />
  );
}
