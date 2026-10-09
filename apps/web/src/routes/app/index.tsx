import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { Bounds, MapLayers } from "@/components/viewer/station-map";
import type { SavedList, Station } from "@/components/viewer/types";
import { Viewer, type ViewerPanel } from "@/components/viewer/viewer";
import { authClient } from "@/lib/auth-client";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStoredState } from "@/lib/use-stored-state";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/app/")({
  validateSearch: z.object({
    // The station or the surf break whose panel is open. One is selected, never both. A break
    // is the catalogue's, or one of the instance's private list.
    station: z.string().optional(),
    break: z.string().optional(),
    privateBreak: z.string().optional(),
    panel: z.enum(["saved", "alerts"]).optional(),
  }),
  component: ViewerRoute,
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// The days of tide a panel opens with, around today: yesterday and the six days after. Scrolled
// to an end, the strip asks for one more, up to what the API gives in one answer.
const TIDE_DAYS = { before: 1, after: 6 };
const TIDE_DAYS_MOST = 15;
const WIND_LIMIT = 500;
const BREAK_LIMIT = 1000;
const DEFAULT_LAYERS: MapLayers = { sea: true, buoys: true, wind: false, breaks: true };

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
function loadable<Data>(query: { data: Data | undefined; isLoading: boolean; isError: boolean }) {
  return { data: query.data, isPending: query.isLoading, isError: query.isError };
}

function ViewerRoute() {
  const search = Route.useSearch();
  const { panel } = search;
  // An empty value selects nothing, and a station wins over a break given with it.
  const selectedId = search.station || undefined;
  const selectedBreakId = selectedId ? undefined : search.break || undefined;
  const selectedPrivateBreakId =
    selectedId || selectedBreakId ? undefined : search.privateBreak || undefined;
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const wide = useMediaQuery("(min-width: 1024px)");
  const now = useNow();
  // Rounded to the hour so the query keys stay the same from one minute to the next.
  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [tideReach, setTideReach] = useState({ of: "", ...TIDE_DAYS });
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
      // The catalogue changes once a week.
      staleTime: 60 * MINUTE_MS,
      // Without them the map shows the stations alone, which needs no message.
      meta: { quiet: true },
    }),
  );
  // The instance's private list is given to its operators and to no one else, so the map asks
  // for it only once the account is known to be one.
  const account = useQuery(
    orpc.v1.account.get.queryOptions({
      enabled: signedIn,
      staleTime: 60 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  const isOperator = account.data?.isOperator === true;
  const privateBreaks = useQuery(
    orpc.v1.privateBreaks.list.queryOptions({
      input: { bbox: bounds?.join(",") ?? "", limit: BREAK_LIMIT },
      enabled: isOperator && layers.breaks && bounds !== null,
      placeholderData: keepPreviousData,
      staleTime: 60 * MINUTE_MS,
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
  const notifications = useQuery(
    orpc.v1.notifications.list.queryOptions({
      input: { limit: 50 },
      enabled: signedIn && panel === "alerts",
      select: (answer) => answer.notifications,
      meta: { quiet: true },
    }),
  );

  const loaded = useMemo(() => {
    const byId = new Map<string, Station>();
    for (const station of wind.data ?? []) byId.set(station.id, station);
    for (const station of waves.data ?? []) byId.set(station.id, station);
    return byId;
  }, [waves.data, wind.data]);

  // A saved station that is neither a buoy nor a wind station in view is fetched on its own.
  const savedIds = useMemo(
    () => [...new Set((lists.data ?? []).flatMap((list) => list.stationIds))],
    [lists.data],
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

  const history = useQuery(
    orpc.v1.stations.readings.queryOptions({
      input: { id: selectedId ?? "", limit: 2000 },
      enabled: selectedId !== undefined,
      meta: { quiet: true },
    }),
  );
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
  const foundPrivate = useQuery(
    orpc.v1.privateBreaks.get.queryOptions({
      input: { id: selectedPrivateBreakId ?? "" },
      enabled: selectedPrivateBreakId !== undefined && isOperator,
      retry: false,
      meta: { quiet: true },
    }),
  );
  const isSelected = (candidate: { id: string }) =>
    candidate.id === (selectedBreakId ?? selectedPrivateBreakId);
  const placed =
    known ??
    history.data?.station ??
    (selectedBreakId
      ? (breaks.data?.breaks.find(isSelected) ?? found.data)
      : selectedPrivateBreakId
        ? (privateBreaks.data?.breaks.find(isSelected) ?? foundPrivate.data)
        : undefined);
  const point = placed && { latitude: placed.latitude, longitude: placed.longitude };
  const atPoint = { latitude: point?.latitude ?? 0, longitude: point?.longitude ?? 0 };
  // A point far from any tide station, or inland, has no tide or forecast: the panel says so.
  const expected = { enabled: point !== undefined, retry: false, meta: { quiet: true } };

  // The tide is a strip of whole days to scroll along, from midnight where the user is.
  // The days asked for belong to what is selected: another selection opens on its first days.
  const selection = selectedId ?? selectedBreakId ?? selectedPrivateBreakId ?? "";
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
      ...expected,
      ...keepAtPoint,
    }),
  );
  const extremes = useQuery(
    orpc.v1.tides.extremes.queryOptions({
      input: { ...atPoint, ...tideSpan },
      ...expected,
      ...keepAtPoint,
    }),
  );
  const forecast = useQuery(
    orpc.v1.forecasts.get.queryOptions({ input: { ...atPoint, days: 4 }, ...expected }),
  );

  const listsKey = orpc.v1.lists.list.queryKey();
  const setLists = (update: (lists: SavedList[]) => SavedList[]) =>
    queryClient.setQueryData(listsKey, (answer) => ({ lists: update(answer?.lists ?? []) }));
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

  // The star answers at once: the list changes on the screen, then the API confirms it.
  function save(listId: string, stationId: string, add: boolean) {
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
            stationIds: [stationId],
            createdAt: today,
            updatedAt: today,
          },
          ...all,
        ];
      }
      return all.map((list) =>
        isTarget(list)
          ? {
              ...list,
              stationIds: add
                ? [...list.stationIds.filter((id) => id !== stationId), stationId]
                : list.stationIds.filter((id) => id !== stationId),
            }
          : list,
      );
    });
    (add ? addStation : removeStation).mutate({ id: listId, stationId });
    if (listId === "favorites" && add) toast.success(m.saved_added_to_favorites());
  }

  // The catalogue's breaks, then the private list's for an operator, each told from the other.
  // The map redraws them when the list changes, so the list changes only with its sources.
  const privateInView = isOperator ? privateBreaks.data?.breaks : undefined;
  const privateIds = useMemo(
    () => new Set(privateInView?.map((found) => found.id)),
    [privateInView],
  );
  const catalogueInView = breaks.data?.breaks;
  const mapBreaks = useMemo(
    () => [
      ...(catalogueInView ?? []),
      ...(privateInView ?? []).map((found) => ({ ...found, isPrivate: true })),
    ],
    [catalogueInView, privateInView],
  );

  return (
    <Viewer
      now={now}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      wide={wide}
      waveStations={loadable(waves)}
      windStations={wind.data ?? []}
      windTruncated={wind.data?.length === WIND_LIMIT}
      breaks={mapBreaks}
      breaksTruncated={
        breaks.data?.next != null || (isOperator && privateBreaks.data?.next != null)
      }
      sea={sea.data}
      layers={layers}
      selectedId={selectedId}
      selectedBreakId={selectedBreakId}
      selectedPrivateBreakId={selectedPrivateBreakId}
      selected={{
        station: known,
        history: loadable(history),
        found: loadable(found),
        foundPrivate: loadable(foundPrivate),
        forecast: loadable(forecast),
        tides: loadable(tides),
        extremes: loadable(extremes),
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
      notifications={loadable(notifications)}
      onLayersChange={setLayers}
      onSelect={(station) => void navigate({ search: { station } })}
      onSelectBreak={(id) =>
        void navigate({ search: privateIds.has(id) ? { privateBreak: id } : { break: id } })
      }
      // A panel opens over the station's and gives it back when it closes.
      onPanelChange={(next: ViewerPanel | undefined) =>
        void navigate({ search: (previous) => ({ ...previous, panel: next }) })
      }
      onBoundsChange={setBounds}
      onSave={save}
      onCreateList={(name) => createList.mutate({ name })}
      onDeleteList={(list) => deleteList.mutate({ id: list.id })}
      onReadNotification={(notification) => markRead.mutate({ id: notification.id })}
    />
  );
}
