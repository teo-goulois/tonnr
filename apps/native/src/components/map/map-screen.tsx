import { APP_NAME } from "@repo/config/app";
import type { Station } from "@repo/client/viewer/types";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { feel } from "@/components/ui/haptics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { describeStation, describeWind } from "./describe";
import { type MapPlace, withRecents } from "./features";
import { DEFAULT_LAYERS, layersForList, layersFrom, LAYERS_KEY, type MapLayers } from "./layers";
import { MapButtons } from "./map-buttons";
import { readSeaTile } from "./map-images";
import { MapLegend } from "./map-legend";
import { currentMapState, onMapRequest } from "./map-state";
import { listName, MapListChips } from "./list-chips";
import { LOW_SHEET, placeHref, placeOf } from "./place-route";
import {
  BREAK_LIMIT,
  MINUTE_MS,
  spotsQuery,
  WIND_APART_KM,
  WIND_LIMIT,
  wavesQuery,
} from "./queries";
import { useRecentPlaces } from "./recents";
import { seaTimeOf } from "./sea";
import { type SeaArrow, seaArrowsReader } from "./sea-arrows";
import { type MapPress, StationMap, type StationMapHandle } from "./station-map";
import { bboxOf, type Bounds, LOCATE_ZOOM, type LngLat, visibleBounds } from "./view";

// The map tab (decisions 018, 040 and 069): the web's viewer as a phone has it, the map with its
// buttons and its legend at the bottom where the thumb is, over the bar of tabs. A press on a
// marker opens its place as a sheet over the map, which stays alive under it; a press held puts a
// new spot there. `?list=<id>` shows one of the account's lists alone, as the saved tab links to.

// The basemap's credits, which the map shows as it opens and folds once it is moved: its names,
// as the style writes them, which no language changes. The sea's are the API's.
const BASEMAP_CREDITS = "© OpenFreeMap © OpenMapTiles © OpenStreetMap";

/** The time, again every minute, so that a reading ages while the map stays open. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The layers the legend switched, kept on the phone as the browser keeps them. */
function useMapLayers() {
  const [layers, setLayers] = useState<MapLayers>(() => {
    try {
      return layersFrom(localStorage.getItem(LAYERS_KEY));
    } catch {
      return DEFAULT_LAYERS;
    }
  });
  const choose = useCallback((next: MapLayers) => {
    setLayers(next);
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(next));
    } catch {
      // A phone that keeps nothing keeps them until the app is closed.
    }
  }, []);
  return [layers, choose] as const;
}

export function MapScreen() {
  const { colors, space } = useTheme();
  const window = useWindowDimensions();
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const tell = useTell();
  const pathname = usePathname();
  const selected = placeOf(pathname);
  const params = useLocalSearchParams<{ list?: string }>();
  const listId =
    signedIn && typeof params.list === "string" && params.list ? params.list : undefined;
  const now = useNow();
  // A figure is written in the reader's units, and drawn again when they change.
  const units = useUnits();
  const [layers, setLayers] = useMapLayers();
  const { recents } = useRecentPlaces();
  const map = useRef<StationMapHandle>(null);
  // Where the map rests, and how close: what is asked of the API and what the arrows are read for.
  const [view, setView] = useState<{ bounds: Bounds; zoom: number } | null>(() => {
    const state = currentMapState();
    return state.bounds ? { bounds: state.bounds, zoom: state.zoom } : null;
  });
  const bbox = view ? bboxOf(visibleBounds(view.bounds)) : "";

  // What the map asks the API, as the web's route asks it.
  const waves = useQuery(wavesQuery());
  const listView = useQuery(
    orpc.v1.lists.view.queryOptions({
      input: { id: listId ?? "" },
      enabled: listId !== undefined,
      retry: false,
    }),
  );
  const list = listId ? listView.data : undefined;
  const drawn = list ? layersForList(layers) : layers;
  // Wind stations are many, so only the ones in view are loaded, one for each place where several
  // networks stand together: decision 048.
  const wind = useQuery(
    orpc.v1.stations.list.queryOptions({
      input: { measures: "wind", bbox, limit: WIND_LIMIT, places: "one", prefer: "sea" },
      enabled: layers.wind && !list && view !== null,
      placeholderData: keepPreviousData,
      // The worker fetches the wind every ten minutes.
      refetchInterval: 5 * MINUTE_MS,
    }),
  );
  const breaks = useQuery(
    orpc.v1.breaks.list.queryOptions({
      input: { bbox, limit: BREAK_LIMIT },
      enabled: layers.breaks && !list && view !== null,
      placeholderData: keepPreviousData,
      // The catalogue changes when its operator adds to it by hand.
      staleTime: 60 * MINUTE_MS,
    }),
  );
  const sea = useQuery(
    orpc.v1.maps.waveHeight.queryOptions({
      // The arrows read their tiles from the same description.
      enabled: layers.sea || layers.arrows,
      staleTime: 30 * MINUTE_MS,
      retry: 1,
    }),
  );
  const lists = useQuery(orpc.v1.lists.list.queryOptions({ enabled: signedIn }));
  const spots = useQuery(spotsQuery(signedIn));

  // A list that was deleted, or that its owner shares no more, gives the whole map back.
  const listGone = listId !== undefined && listView.isError;
  useEffect(() => {
    if (!listGone) return;
    tell({ title: m.list_gone(), tone: "danger" });
    router.setParams({ list: undefined });
  }, [listGone, tell]);

  // A list shown alone draws what it holds, wherever it is: a station or a break that is not
  // among those loaded is asked for on its own.
  const loaded = useMemo(() => {
    const byId = new Map<string, Station>();
    for (const station of wind.data?.stations ?? []) byId.set(station.id, station);
    for (const station of waves.data ?? []) byId.set(station.id, station);
    return byId;
  }, [waves.data, wind.data]);
  const missingStations = useQueries({
    queries: (list?.stationIds ?? [])
      .filter((id) => waves.isSuccess && !loaded.has(id))
      .map((id) => orpc.v1.stations.get.queryOptions({ input: { id } })),
  });
  const missingBreaks = useQueries({
    queries: (list?.breakIds ?? [])
      .filter((id) => !breaks.data?.breaks.some((one) => one.id === id))
      .map((id) => orpc.v1.breaks.get.queryOptions({ input: { id }, retry: false })),
  });
  const listStations = useMemo(() => {
    if (!list) return undefined;
    const found = new Map(loaded);
    for (const query of missingStations) if (query.data) found.set(query.data.id, query.data);
    return list.stationIds.flatMap((id) => found.get(id) ?? []);
    // The answers themselves say when the list of queries has something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, loaded, missingStations.map((query) => query.dataUpdatedAt).join()]);
  const listBreaks = useMemo(() => {
    if (!list) return undefined;
    const found = new Map<string, MapPlace>();
    for (const one of breaks.data?.breaks ?? []) found.set(one.id, one);
    for (const query of missingBreaks) if (query.data) found.set(query.data.id, query.data);
    return list.breakIds.flatMap((id) => found.get(id) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, breaks.data, missingBreaks.map((query) => query.dataUpdatedAt).join()]);

  const mapStations = useMemo(
    () =>
      (listStations ?? waves.data ?? [])
        .filter((station) => station.measures.includes("waves"))
        .map((station) => describeStation(station, now)),
    // A buoy's figures are written in the reader's unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listStations, waves.data, now, units],
  );
  const mapWind = useMemo(
    () =>
      (
        listStations?.filter((station) => !station.measures.includes("waves")) ??
        (layers.wind ? (wind.data?.stations ?? []) : [])
      ).flatMap((station) => describeWind(station, now) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listStations, layers.wind, wind.data, now, units],
  );
  const mapBreaks = useMemo(
    () => withRecents(listBreaks ?? breaks.data?.breaks ?? [], recents, list !== undefined),
    [listBreaks, breaks.data, recents, list],
  );
  const mapSpots = useMemo(() => list?.spots ?? spots.data ?? [], [list, spots.data]);

  // A list shown alone is brought into view once, when what it holds is known.
  const fitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!list) {
      fitted.current = undefined;
      return;
    }
    if (fitted.current === list.id) return;
    const points = [...(listStations ?? []), ...(listBreaks ?? []), ...list.spots];
    const held = list.stationIds.length + list.breakIds.length + list.spots.length;
    // Every station and every break of the list has answered, or the map would move twice.
    const waiting =
      waves.isPending || [...missingStations, ...missingBreaks].some((query) => query.isPending);
    if (points.length < held && waiting) return;
    fitted.current = list.id;
    if (points.length > 0 && !selected) map.current?.fit(points);
  }, [list, listStations, listBreaks, missingStations, missingBreaks, selected, waves.isPending]);

  // The sea at the present, and its arrows, read for the view from the tiles of its direction.
  const seaTime = useMemo(() => seaTimeOf(sea.data?.times, now), [sea.data, now]);
  const readArrows = useMemo(() => seaArrowsReader(readSeaTile), []);
  const [tilesRead, tileCame] = useReducer((count: number) => count + 1, 0);
  const [arrows, setArrows] = useState<SeaArrow[]>([]);
  useEffect(() => {
    const direction = sea.data?.direction;
    if (!drawn.arrows || !direction || !seaTime || !view) {
      setArrows([]);
      return;
    }
    const [west, south, east, north] = view.bounds;
    setArrows(
      readArrows({ west, south, east, north, zoom: view.zoom }, seaTime, direction, tileCame),
    );
  }, [drawn.arrows, sea.data, seaTime, view, readArrows, tilesRead]);

  // Where the reader is: the phone's own dot, once they allowed it, and the button that goes there.
  const [located, setLocated] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  useEffect(() => {
    void Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (permission.granted) setLocated(true);
      })
      .catch(() => {});
  }, []);
  async function locate() {
    setIsLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        tell({
          title: m.native_locate_denied({ name: APP_NAME }),
          tone: "danger",
          action: { label: m.native_open_settings(), onPress: () => void Linking.openSettings() },
        });
        return;
      }
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * MINUTE_MS })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setLocated(true);
      map.current?.focus(
        { latitude: position.coords.latitude, longitude: position.coords.longitude },
        LOCATE_ZOOM,
      );
    } catch {
      tell({ title: m.locate_failed(), tone: "danger" });
    } finally {
      setIsLocating(false);
    }
  }

  // What another screen asks of the map: the search, for a place that has no sheet.
  useEffect(() => onMapRequest((request) => map.current?.focus(request.point, request.zoom)), []);

  // What is over the map: the lists, the legend, and the credits as it opens.
  const [listsOpen, setListsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [creditsShown, setCreditsShown] = useState(true);
  // Where the controls stand: over the low sheet of a place that is open, else over the bar.
  const [frame, setFrame] = useState({ top: 0, height: window.height });
  const controls = useRef<ComponentRef<typeof View>>(null);
  const sheetTop = window.height * (1 - LOW_SHEET) - frame.top;
  const floor = selected ? Math.max(space.s, frame.height - sheetTop + space.s) : space.s;

  function open(press: MapPress) {
    feel("select");
    const href = placeHref(press.kind, press.id);
    // One sheet at a time: a place that is open gives way to the one pressed.
    if (selected) router.replace(href);
    else router.push(href);
    // What the low sheet would cover comes up over it.
    const top = window.height * (1 - LOW_SHEET);
    if (press.point[1] > top - space.xxl) map.current?.lift(press.point, top / 2);
  }

  function addSpot([longitude, latitude]: LngLat) {
    feel("hold");
    requireAccount(m.auth_reason_add_spot(), () =>
      router.push({
        pathname: "/spot/new",
        params: { latitude: String(latitude), longitude: String(longitude) },
      }),
    );
  }

  const ownLists = lists.data?.lists ?? [];
  const joined = lists.data?.joined ?? [];
  const hasLists = signedIn && ownLists.length + joined.length > 0;
  const windThinned = (wind.data?.apartKm ?? 0) > WIND_APART_KM || wind.data?.truncated === true;
  const credits = [BASEMAP_CREDITS, drawn.sea && sea.data ? sea.data.source.attribution : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ flex: 1, backgroundColor: colors["neutral-2"] }}>
      <StationMap
        ref={map}
        stations={drawn.buoys ? mapStations : []}
        wind={mapWind}
        breaks={mapBreaks}
        spots={mapSpots}
        selected={selected}
        layers={drawn}
        sea={sea.data}
        seaTime={seaTime}
        arrows={arrows}
        located={located}
        accessibilityLabel={m.native_map_label()}
        accessibilityHint={m.native_map_hint()}
        onPress={open}
        onLongPress={addSpot}
        onMoved={(state, byHand) => {
          if (state.bounds) setView({ bounds: state.bounds, zoom: state.zoom });
          if (byHand) setCreditsShown(false);
        }}
      />

      {/* The controls stand clear of what the system draws: the status bar at the top, the bar
          of tabs at the bottom. */}
      <SafeAreaView
        edges={["top", "bottom"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
        <View
          ref={controls}
          pointerEvents="box-none"
          style={{ flex: 1 }}
          onLayout={() =>
            controls.current?.measureInWindow((_, top, __, height) => setFrame({ top, height }))
          }
        >
          {/* At the top, what the map says of itself: the buoys that load, or could not, and
              whose data it draws, as it opens. */}
          <View
            pointerEvents="box-none"
            style={{ alignItems: "center", gap: space.xs, paddingTop: space.xs }}
          >
            {waves.isPending && !list ? (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                accessibilityRole="progressbar"
                accessibilityLabel={m.map_loading()}
                style={pill(colors, space)}
              >
                <Skeleton width={12} height={12} round />
                <Text size="s">{m.map_loading()}</Text>
              </Animated.View>
            ) : null}
            {waves.isError && !list ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint={m.action_retry()}
                onPress={() => void waves.refetch()}
                style={pill(colors, space)}
              >
                <Text size="s">{m.map_load_failed()}</Text>
              </Pressable>
            ) : null}
          </View>
          {creditsShown ? (
            <Animated.View
              exiting={FadeOut}
              pointerEvents="box-none"
              style={{ position: "absolute", top: space.xs, left: space.s, right: space.s }}
            >
              {!waves.isPending && !waves.isError ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={m.map_credits()}
                  onPress={() => map.current?.showCredits()}
                  style={{ alignSelf: "flex-start" }}
                >
                  <Text size="xxs" tone="muted" style={creditsText(colors)}>
                    {credits}
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}

          {/* At the bottom, the legend at the left and the buttons at the right, over the bar of
              tabs, or over the low sheet of a place that is open. The lists unfold over the
              legend, where it opens: opening one folds the other. */}
          <Animated.View
            layout={LinearTransition}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: space.s,
              right: space.s,
              bottom: floor,
              flexDirection: "row",
              alignItems: "flex-end",
              gap: space.xs,
            }}
          >
            <View pointerEvents="box-none" style={{ flex: 1, alignItems: "flex-start" }}>
              {listsOpen && hasLists ? null : (
                <MapLegend
                  layers={layers}
                  onLayersChange={setLayers}
                  expanded={legendOpen}
                  onExpandedChange={(open) => {
                    setLegendOpen(open);
                    if (open) setListsOpen(false);
                  }}
                  maxHeight={Math.max(160, frame.height - floor - space.xxl * 2)}
                  onShowCredits={() => map.current?.showCredits()}
                  windTruncated={!list && windThinned}
                  breaksTruncated={!list && breaks.data?.next != null}
                />
              )}
            </View>
            <View pointerEvents="box-none" style={{ alignItems: "flex-end", gap: space.xs }}>
              {hasLists && listsOpen ? (
                <View
                  pointerEvents="box-none"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 48 + space.xs,
                    width: window.width - 2 * space.s - 48 - space.xs,
                    height: 48,
                    flexDirection: "row",
                  }}
                >
                  <MapListChips
                    lists={ownLists}
                    joined={joined}
                    current={list?.id}
                    onPick={(id) => router.setParams({ list: id })}
                  />
                </View>
              ) : null}
              <MapButtons
                isLocating={isLocating}
                located={located}
                onLocate={() => void locate()}
                onSearch={() => router.push("/search")}
                {...(hasLists && {
                  lists: {
                    open: listsOpen,
                    showing: list ? listName(list) : undefined,
                    onToggle: () => {
                      setListsOpen(!listsOpen);
                      if (!listsOpen) setLegendOpen(false);
                    },
                  },
                })}
              />
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** A short line of the map's own, floating at the top: the web's status pill. */
function pill(
  colors: ReturnType<typeof useTheme>["colors"],
  space: ReturnType<typeof useTheme>["space"],
) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.xs,
    minHeight: 32,
    paddingHorizontal: space.s,
    borderRadius: 16,
    backgroundColor: colors["neutral-1"],
    boxShadow: `inset 0 0 0 0.5px ${colors["neutral-10-transparent"]}`,
  };
}

/** The credits as the web writes them over its map: small, on a veil of the surface. */
function creditsText(colors: ReturnType<typeof useTheme>["colors"]) {
  return {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden" as const,
    backgroundColor: `${colors["neutral-1"]}cc`,
  };
}
