import { seaTimeAt, seaTimes } from "@repo/client/map/sea";
import { ListsIcon } from "@repo/ui/icon";
import type { Station } from "@repo/client/viewer/types";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Spinner } from "heroui-native";

import { listName } from "@/components/lists/items";
import { useSharedList } from "@/components/lists/use-shared-list";
import { Button } from "@/components/ui/button";
import { edge } from "@/components/ui/edge";
import { feel } from "@/components/ui/haptics";
import { ROUND } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import type { Route } from "@/lib/links";
import { useRecentPlaces } from "@/lib/recents";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { useNow } from "@/lib/use-now";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { describeStation, describeWind } from "./describe";
import { type MapPlace, withRecents } from "./features";
import { DEFAULT_LAYERS, layersForList, layersFrom, LAYERS_KEY, type MapLayers } from "./layers";
import { creditParts, joinedCredits } from "./basemap";
import { MapButtons } from "./map-buttons";
import { MapCredits } from "./map-credits";
import { readSeaTile } from "./map-images";
import { useLocate } from "./locate";
import { MapLegend } from "./map-legend";
import { useBasemapAttribution } from "./use-basemap";
import { currentMapState, onMapRequest } from "./map-state";
import { MapListChips } from "./list-chips";
import { currentSheet, floorOver, onSheetChange } from "./sheet-state";
import { type Opening, opensAgain, placeOf, pressedHref } from "./place-route";
import {
  BREAK_LIMIT,
  MINUTE_MS,
  spotsQuery,
  WIND_APART_KM,
  WIND_LIMIT,
  wavesQuery,
} from "./queries";
import { type SeaArrow, seaArrowsReader } from "./sea-arrows";
import { type MapPress, StationMap, type StationMapHandle } from "./station-map";
import { bboxOf, type Bounds, LOCATE_ZOOM, type LngLat, visibleBounds } from "./view";

// The map tab (decisions 018, 040 and 069): the web's viewer as a phone has it, the map with its
// buttons and its legend at the bottom where the thumb is, over the bar of tabs. A press on a
// marker opens its place as a sheet over the map, which stays alive under it; a press held puts a
// new spot there. `?list=<id>` shows one of the account's lists alone, as the saved tab links to,
// and `?shared=<token>` a list opened by its link, as the web's `?shared=` does (decision 035).

/** What the map's route among the tabs is navigated with: what it shows alone. */
type MapNavigation = {
  setParams: (params: { list?: string | undefined; shared?: string | undefined }) => void;
};

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

// How much further in from the edge the map's buttons stand than its legend, so that they stand
// over the middle of the "+" of the bar of tabs: the web's.
const BUTTONS_IN = 6;
// The spinner of the map's status, as the web's.
const SPINNER = { width: 14, height: 14 };
// Nothing covers the map but the bars, which the map is drawn under as the web's is.
const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
// How long iOS's sheet takes to open, close or move to another height, and its curve, which what
// stands on it takes too.
const IOS_SHEET_MS = 500;
const IOS_SHEET_CURVE = [0.32, 0.72, 0, 1] as const;

export function MapScreen() {
  const { colors, space, scheme, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const tell = useTell();
  const pathname = usePathname();
  // The place whose sheet is in front, which a press on the map gives another place.
  const front = placeOf(pathname);
  // The buttons and the legend stand on the low sheet of a place that is open, as tall as its
  // summary, which its sheet tells, with the place it selects. A sheet that is raised covers them
  // where they stand: they fade away, out of reach of a finger and of a screen reader, and go down
  // with it when it leaves, as on the web.
  const sheet = useSyncExternalStore(onSheetChange, currentSheet);
  // The place selected on the map: the one a place's sheet selects, which stays selected while a
  // sheet of its own stands over it, a bookmark, an alert or the station nearest it, as the web
  // keeps it in its address, and none once the map is in front again.
  const selected = pathname === "/" ? undefined : (sheet.place ?? front);
  // The map's own route among the tabs, whose parameters say what it shows alone: `router`'s
  // would be those of the screen in front, a place's sheet.
  const navigation = useNavigation<MapNavigation>();
  const params = useLocalSearchParams<{ list?: string; shared?: string }>();
  // A list opened by its link comes first, as on the web.
  const shared = typeof params.shared === "string" && params.shared ? params.shared : undefined;
  const listId =
    signedIn && !shared && typeof params.list === "string" && params.list ? params.list : undefined;
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
  // A visitor reads it, and the places it holds, by its link while the map shows it.
  const door = useSharedList(shared ?? "");
  const list = shared ? door.list : listId ? listView.data : undefined;
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
    navigation.setParams({ list: undefined });
  }, [listGone, tell, navigation]);
  // A list opened by its link that is the account's, or that it kept, is shown as one of its own,
  // by its id. One that asks a password, or opens nothing, is read where its short address leads,
  // in the saved tab, which asks the password or says why, and the map shows everything again.
  const sharedOwn = shared && door.list && door.list.access !== "link" ? door.list.id : undefined;
  const sharedShut =
    shared && (door.state === "locked" || door.state === "missing" || door.state === "failed");
  useEffect(() => {
    if (sharedOwn) navigation.setParams({ list: sharedOwn, shared: undefined });
  }, [sharedOwn, navigation]);
  useEffect(() => {
    if (!shared || !sharedShut) return;
    navigation.setParams({ shared: undefined });
    router.navigate(`/saved/shared/${encodeURIComponent(shared)}` as Route);
  }, [shared, sharedShut, navigation]);

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

  // A buoy in one of the account's lists says so on its pill.
  const savedIds = useMemo(
    () => new Set((lists.data?.lists ?? []).flatMap((one) => one.stationIds)),
    [lists.data],
  );
  const mapStations = useMemo(
    () =>
      (listStations ?? waves.data ?? [])
        .filter((station) => station.measures.includes("waves"))
        .map((station) => describeStation(station, now, savedIds)),
    // A buoy's figures are written in the reader's unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listStations, waves.data, now, savedIds, units],
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

  // The place a sheet is open on, which the map brings into view and, a break or a spot, draws as
  // a pill: among those drawn, or as its sheet read it, opened by its address or with the breaks
  // switched off.
  // A station is among those loaded, or asked for on its own: a wind station far from the view,
  // which a link names, is not loaded, and the map is brought to it all the same.
  const drawnPlace =
    selected?.kind === "break"
      ? mapBreaks.find((one) => one.id === selected.id)
      : selected?.kind === "spot"
        ? mapSpots.find((one) => one.id === selected.id)
        : selected?.kind === "station"
          ? loaded.get(selected.id)
          : undefined;
  const quiet = { retry: false, meta: { quiet: true } } as const;
  const selectedBreak = useQuery(
    orpc.v1.breaks.get.queryOptions({
      input: { id: selected?.id ?? "" },
      enabled: selected?.kind === "break" && !drawnPlace,
      ...quiet,
    }),
  );
  const selectedSpot = useQuery(
    orpc.v1.spots.get.queryOptions({
      input: { id: selected?.id ?? "" },
      enabled: selected?.kind === "spot" && signedIn && !drawnPlace,
      ...quiet,
    }),
  );
  const selectedStation = useQuery(
    orpc.v1.stations.get.queryOptions({
      input: { id: selected?.id ?? "" },
      // The buoys come all at once: one that is not among them is asked for once they have come.
      enabled: selected?.kind === "station" && !drawnPlace && !waves.isPending,
      ...quiet,
    }),
  );
  const asked =
    selected?.kind === "break"
      ? selectedBreak.data
      : selected?.kind === "spot"
        ? selectedSpot.data
        : selectedStation.data;
  const selectedPlace: MapPlace | undefined =
    drawnPlace ?? (asked && asked.id === selected?.id ? asked : undefined);

  // Where the controls stand, clear of what the system draws, and where the screen does: what
  // stands over the low sheet of a place that is open, and what a list is fitted inside.
  const [frame, setFrame] = useState({ top: 0, height: window.height });
  const controls = useRef<ComponentRef<typeof View>>(null);
  const [screen, setScreen] = useState({ top: 0, height: window.height });
  const root = useRef<ComponentRef<typeof View>>(null);

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
    // Inside what the status bar and the bar of tabs cover, which the controls stand clear of.
    const covered = {
      top: Math.max(0, frame.top - screen.top),
      bottom: Math.max(0, screen.top + screen.height - frame.top - frame.height),
    };
    if (points.length > 0 && !selected) map.current?.fit(points, covered);
  }, [
    list,
    listStations,
    listBreaks,
    missingStations,
    missingBreaks,
    selected,
    waves.isPending,
    frame,
    screen,
  ]);

  // The sea at the present, and its arrows, read for the view from the tiles of its direction.
  // The web's own moment, as its timeline stands while hidden.
  const seaTime = useMemo(() => {
    const times = seaTimes(sea.data?.times, now);
    return times && new Date(seaTimeAt(times));
  }, [sea.data, now]);
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

  // Where the reader was found, which the map marks, and the button that finds them.
  const { point: located, isLocating, locate } = useLocate();
  async function findMe() {
    const point = await locate();
    if (point) map.current?.focus(point, LOCATE_ZOOM);
  }

  // What another screen asks of the map: the search, for a place that has no sheet.
  useEffect(() => onMapRequest((request) => map.current?.focus(request.point, request.zoom)), []);

  // What is over the map: the lists, the legend, and the credits as it opens.
  const [listsOpen, setListsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [creditsShown, setCreditsShown] = useState(true);
  const floor = floorOver(sheet, frame, window.height, space.s);
  const isCovered = sheet.height > 0 && sheet.raised;
  // What covers the map, which a place selected is shown clear of and a move is given: the status
  // bar and the low sheet, whether it is raised or not, as the web's map is given its drawer's.
  // While the sheet of what is selected has not said how tall it stands, the place waits for it.
  const statusBar = Math.max(0, frame.top - screen.top);
  const underMap = window.height - (screen.top + screen.height);
  const padding = useMemo(
    () =>
      sheet.height > 0
        ? { top: statusBar, right: 0, bottom: Math.max(0, sheet.height - underMap), left: 0 }
        : selected
          ? undefined
          : NO_PADDING,
    [sheet.height, statusBar, underMap, selected],
  );
  // They move and fade on the theme's large motion, as the web's foot does, and at once for a
  // reader who asked for no motion.
  const footOpacity = useSharedValue(isCovered ? 0 : 1);
  useEffect(() => {
    const to = isCovered ? 0 : 1;
    footOpacity.value = reduceMotion
      ? to
      : withTiming(to, {
          duration: motion.largeDuration,
          easing: Easing.bezier(...motion.largeEasing),
        });
  }, [isCovered, reduceMotion, footOpacity, motion]);
  // They move with the sheet they stand on, on its own time: iOS's sheet takes about half a
  // second, on the curve the web's drawers of iOS's kind take, where the web's own drawer and its
  // foot both take the theme's large motion. Android's sheet keeps to the theme's. Only how high
  // they stand moves so: what the foot holds grows upward at once, and the legend that opens moves
  // nothing beside it.
  const footLift = useSharedValue(floor - space.s);
  useEffect(() => {
    const to = floor - space.s;
    footLift.value = reduceMotion
      ? to
      : withTiming(
          to,
          Platform.OS === "ios"
            ? { duration: IOS_SHEET_MS, easing: Easing.bezier(...IOS_SHEET_CURVE) }
            : { duration: motion.largeDuration, easing: Easing.bezier(...motion.largeEasing) },
        );
  }, [floor, space.s, reduceMotion, footLift, motion]);
  const footStyle = useAnimatedStyle(() => ({
    opacity: footOpacity.value,
    transform: [{ translateY: -footLift.value }],
  }));

  // The place whose sheet was just asked for, until it is in front.
  const opening = useRef<Opening | null>(null);

  function open(press: MapPress) {
    const key = `${press.kind}:${press.id}`;
    if (!front && opensAgain(opening.current, key, Date.now())) return;
    feel("select");
    // One sheet at a time: the sheet of a place that is open, which is the screen in front, is
    // given the place pressed, at the height it stands, on its first tab; another opens low, with
    // the map in view. What the sheet covers comes into view over it, as the map reveals what is
    // selected.
    if (front) {
      router.setParams({
        kind: press.kind,
        id: press.id,
        tab: undefined,
        notice: undefined,
        new: undefined,
        // A station's sheet over a place's selects the place pressed from then on.
        from: "map",
      });
    } else {
      opening.current = { key, at: Date.now() };
      router.push(pressedHref(press.kind, press.id));
    }
  }

  function addSpot([longitude, latitude]: LngLat) {
    feel("hold");
    const href = `/spot/new?latitude=${latitude}&longitude=${longitude}` as const;
    // One sheet at a time here too: the place that is open gives way to the new spot. A visitor
    // goes on to it once signed in.
    requireAccount(
      m.auth_reason_add_spot(),
      () => (front ? router.replace(href) : router.push(href)),
      href,
    );
  }

  const ownLists = lists.data?.lists ?? [];
  const joined = lists.data?.joined ?? [];
  // Whoever reads a list by its link has no other: the map names it, and a press opens it, as on
  // the web, where the account's lists stand otherwise.
  const hasLists = signedIn && !shared && ownLists.length + joined.length > 0;
  const windThinned = (wind.data?.apartKm ?? 0) > WIND_APART_KM || wind.data?.truncated === true;
  // Whose data the map draws, the sea's first as the web writes them: the basemap's names, as its
  // tiles write them, which no language changes, and the sea's, the API's.
  const basemapCredits = useBasemapAttribution(scheme);
  const credits = useMemo(
    () =>
      joinedCredits([
        drawn.sea && sea.data ? creditParts(sea.data.source.attribution) : [],
        creditParts(basemapCredits),
      ]),
    [drawn.sea, sea.data, basemapCredits],
  );

  return (
    <View
      ref={root}
      style={{ flex: 1, backgroundColor: colors["neutral-2"] }}
      onLayout={() =>
        root.current?.measureInWindow((_, top, __, height) => setScreen({ top, height }))
      }
    >
      <StationMap
        ref={map}
        stations={drawn.buoys ? mapStations : []}
        wind={mapWind}
        breaks={mapBreaks}
        spots={mapSpots}
        selected={selected}
        selectedPlace={selectedPlace}
        padding={padding}
        layers={drawn}
        sea={sea.data}
        seaTime={seaTime}
        arrows={arrows}
        userLocation={located}
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
          {/* At the top, whose data the map draws, as it opens and once the legend asks: it folds
              as soon as a finger moves the map. */}
          {creditsShown ? (
            <Animated.View
              exiting={FadeOut}
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: space.s,
                left: space.s,
                right: space.s,
                alignItems: "flex-end",
              }}
            >
              <MapCredits parts={credits} onFold={() => setCreditsShown(false)} />
            </Animated.View>
          ) : null}

          {/* At the bottom, the legend at the left and the buttons at the right, over the bar of
              tabs, or over the low sheet of a place that is open. The lists unfold over the
              legend, where it opens: opening one folds the other. */}
          <Animated.View
            pointerEvents={isCovered ? "none" : "box-none"}
            accessibilityElementsHidden={isCovered}
            importantForAccessibility={isCovered ? "no-hide-descendants" : "auto"}
            style={[
              {
                position: "absolute",
                left: space.s,
                // The buttons stand over the middle of the "+" of the bar, which is wider than
                // them.
                right: space.s + BUTTONS_IN,
                // Over the bar of tabs, and lifted onto the low sheet.
                bottom: space.s,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: space.xs,
              },
              footStyle,
            ]}
          >
            <View
              pointerEvents="box-none"
              style={{ flex: 1, alignItems: "flex-start", gap: space.xs }}
            >
              {/* The list the map shows by its link, which opens it in the saved tab, where it
                  is kept and its places are listed, as the web's button opens its saved panel. */}
              {shared && list ? (
                <Button
                  variant="outline"
                  icon={ListsIcon}
                  onPress={() =>
                    router.navigate(`/saved/shared/${encodeURIComponent(shared)}` as Route)
                  }
                  style={[
                    { maxWidth: "70%", backgroundColor: colors["neutral-1"] },
                    edge(colors["neutral-10-transparent"], { inset: true }),
                  ]}
                >
                  {listName(list)}
                </Button>
              ) : null}
              {/* What the map says of itself: the buoys that load, or could not, over the legend.
                  The lists unfold where it stands, and it leaves them the room. */}
              {waves.isPending && !list && !(listsOpen && hasLists) ? (
                <Animated.View
                  entering={FadeIn}
                  exiting={FadeOut}
                  accessibilityRole="progressbar"
                  accessibilityLabel={m.map_loading()}
                  style={pill(colors, space)}
                >
                  <Spinner size="sm" color={colors["neutral-10"]} style={SPINNER}>
                    <Spinner.Indicator iconProps={SPINNER} />
                  </Spinner>
                  <Text size="s">{m.map_loading()}</Text>
                </Animated.View>
              ) : null}
              {waves.isError && !list && !(listsOpen && hasLists) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={m.action_retry()}
                  onPress={() => void waves.refetch()}
                  style={pill(colors, space)}
                >
                  <Text size="s">{m.map_load_failed()}</Text>
                </Pressable>
              ) : null}
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
                  // The credits open over the map and the legend stays open, as on the web.
                  onShowCredits={() => setCreditsShown(true)}
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
                    // Beside the lists' button, the first of the column.
                    right: ROUND + space.xs,
                    width: window.width - 2 * space.s - BUTTONS_IN - ROUND - space.xs,
                    height: ROUND,
                    flexDirection: "row",
                  }}
                >
                  <MapListChips
                    lists={ownLists}
                    joined={joined}
                    current={list?.id}
                    onPick={(id) => navigation.setParams({ list: id, shared: undefined })}
                  />
                </View>
              ) : null}
              <MapButtons
                isLocating={isLocating}
                located={located !== null}
                onLocate={() => void findMe()}
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

/** A short line of the map's own, over its legend: the web's status pill. */
function pill(
  colors: ReturnType<typeof useTheme>["colors"],
  space: ReturnType<typeof useTheme>["space"],
) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.xs,
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: 999,
    borderCurve: "continuous" as const,
    backgroundColor: colors["neutral-1"],
    ...edge(colors["neutral-10-transparent"]),
  };
}
