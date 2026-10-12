import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  ListsIcon,
  LocateIcon,
  LockIcon,
  MinusIcon,
  PinPlusIcon,
  PlusIcon,
  XIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import {
  type CSSProperties,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useAuthPrompt } from "@/components/auth/auth-prompt";
import {
  type FoundPlace,
  NewSpotPanel,
  type SpotDraft,
  type SpotSearch,
} from "@/components/spots/new-spot-panel";
import type { Alerting } from "@/components/alerts/types";
import type { SpotDescription } from "@/components/spots/spot-guide";
import { ListPanel } from "@/components/lists/list-panel";
import { ShareListDialog } from "@/components/lists/share-dialog";
import { type SpotEdit, SpotEditor } from "@/components/spots/spot-editor";
import { SpotActions } from "@/components/spots/spot-menu";
import { SpotPanel } from "@/components/spots/spot-panel";
import { compassPoint, formatAgo, formatSeconds, freshnessOf, toKnots } from "@/lib/format";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages.js";

import { AlertsPanel, type AlertsTab } from "./alerts-panel";
import { BreakPanel } from "./break-panel";
import { ChartsAtRest, useDrawerRest } from "./chart-turns";
import type { Nearby, NearbyWind } from "./details/parts";
import { HISTORY_DAYS } from "./details/wind";
import { MapLegend } from "./map-legend";
import { AccountPrompt, SavedPanel } from "./saved-panel";
import { SeaTimeline, type SeaTimes } from "./sea-timeline";
import { ReadingAge, StationActions, holds, listName } from "./station-actions";
import {
  type Bounds,
  type MapBreak,
  type MapLayers,
  type MapPoint,
  type MapStation,
  type SeaLayer,
  StationMap,
  type StationMapHandle,
  type WindStation,
} from "./station-map";
import { StationPanel } from "./station-panel";
import {
  type AlertNotification,
  type Forecast,
  type JoinedList,
  type ListView,
  type Loadable,
  type SavedBreak,
  type SavedItem,
  type SavedList,
  type Spot,
  type Station,
  type StationReadings,
  type SurfBreak,
  type TideExtremes,
  type TideTimeline,
  periodOf,
} from "./types";
import { SHEET_SNAP_POINTS, SIDE_PANEL_WIDTH, ViewerDrawer } from "./viewer-drawer";

const HOUR_MS = 60 * 60 * 1000;
// How far back the sea can be shown.
const SEA_PAST_MS = 24 * HOUR_MS;

// The model's last instants often spill a few hours into one more day, by the clock of the reader.
// The timeline stops at the end of the day before, so that its last day is a whole one.
function endOfLastWholeDay(latest: number, stepMs: number) {
  const midnight = new Date(latest).setHours(0, 0, 0, 0);
  const nextMidnight = new Date(midnight).setDate(new Date(midnight).getDate() + 1);
  if (latest + stepMs >= nextMidnight) return latest;
  return latest - (Math.floor((latest - midnight) / stepMs) + 1) * stepMs;
}
// A wind reading older than this says little of the wind now.
const FRESH_WIND_MS = 2 * HOUR_MS;

// "add" is the panel that adds a spot. It stands beside the map, which takes the marker.
export type ViewerPanel = "saved" | "alerts" | "add";
// How close the map comes to a place the search found: near enough to see where the wave breaks.
const PLACE_ZOOM = 13;

/** What the panel that adds a spot is given, and what it asks for. */
export type AddingSpot = {
  query: string;
  search: SpotSearch;
  draft: SpotDraft;
  // A spot the account already has where the marker stands.
  near: { id: string; name: string } | undefined;
  isFull: boolean;
  isSaving: boolean;
  onQueryChange: (query: string) => void;
  onPick: (found: FoundPlace) => void;
  // The marker was put somewhere on the map, on a break of the catalogue or not.
  onPlace: (point: MapPoint, breakId?: string) => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
};

/** The sea's wave height as map tiles, and the instants the model has a field for. */
export type SeaDescription = SeaLayer & {
  times: { start: Date; end: Date; stepSeconds: number };
};

type ViewerProps = {
  now: number;
  theme: "light" | "dark";
  // A wide screen has room for a panel beside the map. A phone gets sheets.
  wide: boolean;
  waveStations: Loadable<Station[]>;
  // The wind stations in view.
  windStations: Station[];
  windTruncated: boolean;
  // The surf breaks in view.
  breaks: MapBreak[];
  breaksTruncated: boolean;
  sea: SeaDescription | undefined;
  layers: MapLayers;
  // The user's own spots.
  spots: Loadable<Spot[]>;
  // A station, a break or a spot is selected, never two of them.
  selectedId: string | undefined;
  selectedBreakId: string | undefined;
  selectedSpotId: string | undefined;
  selected: {
    station: Station | undefined;
    history: Loadable<StationReadings>;
    // How many days of readings the history holds.
    historyDays: number;
    found: Loadable<SurfBreak>;
    spot: Loadable<Spot>;
    // The forecast and the tide at the selected station or break.
    forecast: Loadable<Forecast>;
    tides: Loadable<TideTimeline>;
    extremes: Loadable<TideExtremes>;
    // At a surf break or a spot: the buoy the sea is read on.
    nearby: Nearby | undefined;
    // And the station its wind is read on.
    nearbyWind: NearbyWind | undefined;
  };
  adding: AddingSpot;
  // Asks for one more day of tide, before the days loaded or after them.
  onTideExtend: (direction: -1 | 1) => void;
  // Asks for a week of the selected station's readings.
  onHistoryExtend: () => void;
  // The buoy opened from a surf break, in a second drawer over the break's. Closing it gives the
  // break back, which the map never left.
  buoy: {
    id: string | undefined;
    station: Station | undefined;
    history: Loadable<StationReadings>;
    forecast: Loadable<Forecast>;
    tides: Loadable<TideTimeline>;
    extremes: Loadable<TideExtremes>;
  };
  onOpenBuoy: (stationId: string | undefined) => void;
  panel: ViewerPanel | undefined;
  signedIn: boolean;
  lists: Loadable<SavedList[]>;
  // The stations and the surf breaks the lists name, by id.
  savedStations: Map<string, Station>;
  savedBreaks: Map<string, SavedBreak>;
  notifications: Loadable<AlertNotification[]>;
  // The alerts of the account, its settings, and what the screens do with them.
  alerting: Alerting;
  // The part of the alerts panel in view.
  alertsTab: AlertsTab;
  onAlertsTabChange: (tab: AlertsTab) => void;
  onLayersChange: (layers: MapLayers) => void;
  onSelect: (stationId: string | undefined) => void;
  onSelectBreak: (breakId: string) => void;
  onSelectSpot: (spotId: string) => void;
  onDeleteSpot: (spot: Spot) => void;
  isDeletingSpot: boolean;
  // The owner renames a spot or moves it. `done` is called once it is saved.
  onChangeSpot: (
    spot: Spot,
    change: { name: string; latitude: number; longitude: number },
    done: () => void,
  ) => void;
  isChangingSpot: boolean;
  // The owner asks that a spot be made public, or takes the request back.
  onPublishSpot: (spot: Spot, note: string, done: () => void) => void;
  onCancelPublication: (spot: Spot) => void;
  isAskingPublication: boolean;
  // The spot that was just added, whose owner is offered to describe it, until they answer.
  newSpotId: string | undefined;
  onSpotOfferSeen: () => void;
  // The owner says what a spot is like. `done` is called once it is saved.
  onDescribeSpot: (spot: Spot, said: SpotDescription, done: () => void) => void;
  isDescribingSpot: boolean;
  onPanelChange: (panel: ViewerPanel | undefined) => void;
  onBoundsChange: (bounds: Bounds) => void;
  // `listId` is a list's id, or "favorites".
  onSave: (listId: string, item: SavedItem, add: boolean) => void;
  // Makes a list, with what is given in it from the start.
  onCreateList: (name: string, item?: SavedItem) => void;
  onDeleteList: (list: SavedList) => void;
  // The one list the map shows alone, when it shows one: the account's, one it kept, or one
  // opened by its link (decision 035). The stations and the breaks given above are then its own.
  listView: ListView | undefined;
  // The lists of others that the account kept.
  joined: JoinedList[];
  onViewList: (listId: string) => void;
  // Back to the whole map. Undefined for a visitor, who has the list alone.
  onExitList: (() => void) | undefined;
  onKeepList: () => void;
  isKeepingList: boolean;
  onLeaveList: () => void;
  // The owner shares a list, changes what its link asks, gives it a new link, or stops.
  sharing: {
    isSaving: boolean;
    onShare: (list: SavedList, password?: string | null) => void;
    onRenew: (list: SavedList) => void;
    onStop: (list: SavedList) => void;
  };
  // A reader makes a spot of their own of a spot that was shared with them.
  onCopySpot: (spot: Spot) => void;
  isCopyingSpot: boolean;
  onReadNotification: (notification: AlertNotification) => void;
};

function describeStation(station: Station, now: number, savedIds: Set<string>): MapStation {
  const reading = station.latestReading;
  const freshness = freshnessOf(reading?.observedAt, now);
  const shown = freshness === "none" ? null : reading;
  const height = shown?.significantHeightMeters ?? null;
  const period = periodOf(shown);
  const direction = shown?.peakDirectionDegrees ?? null;

  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    heightMeters: height,
    periodSeconds: period,
    directionDegrees: direction,
    freshness,
    isSheltered: station.exposure === "sheltered",
    isSaved: savedIds.has(station.id),
    label: [
      station.name,
      height !== null && formatHeight(height),
      period !== null && formatSeconds(period),
      direction !== null && m.map_from({ direction: compassPoint(direction) }),
      shown && formatAgo(shown.observedAt, now),
    ]
      .filter(Boolean)
      .join(", "),
  };
}

function describeWindStation(station: Station, now: number): WindStation[] {
  const reading = station.latestReading;
  const speed = toKnots(reading?.windSpeedMetersPerSecond);
  if (!reading || speed === null || now - reading.observedAt.getTime() > FRESH_WIND_MS) return [];

  const direction = reading.windDirectionDegrees;
  return [
    {
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      speedKnots: speed,
      directionDegrees: direction,
      label: [
        station.name,
        m.map_wind_speed({ speed: formatWind(speed) }),
        direction !== null && m.map_from({ direction: compassPoint(direction) }),
      ]
        .filter(Boolean)
        .join(", "),
    },
  ];
}

type Selection = ViewerProps["selected"] & {
  id: string | undefined;
  breakId: string | undefined;
  spotId: string | undefined;
};

function sameLoadable<T>(one: Loadable<T>, other: Loadable<T>) {
  return (
    one.data === other.data &&
    one.isPending === other.isPending &&
    one.isError === other.isError &&
    one.isUnavailable === other.isUnavailable
  );
}

// Whether two renders show the same selection in the same state. The route describes it anew at
// each render, and a description that says nothing new must not draw the panel again.
function sameSelection(one: Selection, other: Selection) {
  return (
    one.id === other.id &&
    one.breakId === other.breakId &&
    one.spotId === other.spotId &&
    one.station === other.station &&
    sameLoadable(one.history, other.history) &&
    one.historyDays === other.historyDays &&
    sameLoadable(one.found, other.found) &&
    sameLoadable(one.spot, other.spot) &&
    sameLoadable(one.forecast, other.forecast) &&
    sameLoadable(one.tides, other.tides) &&
    sameLoadable(one.extremes, other.extremes) &&
    one.nearby === other.nearby &&
    one.nearbyWind === other.nearbyWind
  );
}

// A drawer that holds no surf break has none to say anything of.
const NO_BREAK: Loadable<SurfBreak> = { data: undefined, isPending: false, isError: false };
const NO_SPOT: Loadable<Spot> = { data: undefined, isPending: false, isError: false };

/**
 * What a drawer shows, and what of it is drawn. The drawer keeps its content while it slides
 * away. The charts of a panel take long to draw, and each answer of the API draws them again:
 * drawn at once, they stop the drawer and the map while these move. So the panel's content is
 * drawn behind, a little at a time, and the drawer does not wait for it. Until the content of a
 * new selection is drawn, there is none: not the one before.
 */
function useShown(isOpen: boolean, current: Selection) {
  const last = useRef(current);
  if (isOpen && !sameSelection(last.current, current)) last.current = current;
  const shown = last.current;
  const drawn = useDeferredValue(shown);
  const isDrawn =
    drawn.id === shown.id && drawn.breakId === shown.breakId && drawn.spotId === shown.spotId;
  return { shown, drawn: isDrawn ? drawn : undefined };
}

/** The map of the buoys, the wind stations and the sea, with the panels that open from it. */
// No alert was asked for at the spot that is drawn: the same value at every render.
const NO_ALERT_ASKED = { count: 0 };

export function Viewer({
  now,
  theme,
  wide,
  waveStations,
  windStations,
  windTruncated,
  breaks,
  breaksTruncated,
  sea,
  layers,
  spots,
  selectedId,
  selectedBreakId,
  selectedSpotId,
  selected,
  adding,
  onTideExtend,
  onHistoryExtend,
  buoy,
  onOpenBuoy,
  panel,
  signedIn,
  lists,
  savedStations,
  savedBreaks,
  notifications,
  alerting,
  alertsTab,
  onAlertsTabChange,
  onLayersChange,
  onSelect,
  onSelectBreak,
  onSelectSpot,
  onDeleteSpot,
  isDeletingSpot,
  onChangeSpot,
  isChangingSpot,
  onPublishSpot,
  onCancelPublication,
  isAskingPublication,
  newSpotId,
  onSpotOfferSeen,
  onDescribeSpot,
  isDescribingSpot,
  onPanelChange,
  onBoundsChange,
  onSave,
  onCreateList,
  onDeleteList,
  listView,
  joined,
  onViewList,
  onExitList,
  onKeepList,
  isKeepingList,
  onLeaveList,
  sharing,
  onCopySpot,
  isCopyingSpot,
  onReadNotification,
}: ViewerProps) {
  const map = useRef<StationMapHandle>(null);
  const promptAuth = useAuthPrompt();
  const [userLocation, setUserLocation] = useState<MapPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  // How many steps of the model the sea is shown ahead of now.
  const [seaSteps, setSeaSteps] = useState(0);
  // Unfolded on a wide screen, folded on a phone, until the visitor chooses.
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null);
  const units = useUnits();

  // The charts of a station's panel load apart from the map. Asking for them now means they are
  // there by the time a station is opened.
  useEffect(() => {
    void import("./sea-chart");
    void import("./tide-chart");
    void import("./details/metric-lanes");
    void import("./details/wind-chart");
  }, []);

  const savedIds = useMemo(
    () => new Set((lists.data ?? []).flatMap((list) => list.stationIds)),
    [lists.data],
  );
  const mapStations = useMemo(
    () => (waveStations.data ?? []).map((station) => describeStation(station, now, savedIds)),
    // A buoy's label says its height in the reader's unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [waveStations.data, now, savedIds, units],
  );
  const mapWindStations = useMemo(
    () => (layers.wind ? windStations.flatMap((station) => describeWindStation(station, now)) : []),
    // A badge's label says the wind in the reader's unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers.wind, windStations, now, units],
  );

  // The model's latest field that is not in the future, then as many steps ahead as asked. The
  // model keeps years of the past: the timeline goes a day back, enough to see what just came in.
  const seaStepMs = (sea?.times.stepSeconds ?? 0) * 1000;
  const seaTimes = useMemo<SeaTimes | undefined>(() => {
    if (!sea || seaStepMs <= 0) return undefined;
    const start = sea.times.start.getTime();
    const onStep = (time: number) => start + Math.floor((time - start) / seaStepMs) * seaStepMs;
    const present = onStep(now);
    return {
      present,
      earliest: Math.max(start, onStep(present - SEA_PAST_MS)),
      latest: endOfLastWholeDay(onStep(sea.times.end.getTime()), seaStepMs),
      stepMs: seaStepMs,
    };
  }, [sea, seaStepMs, now]);
  const seaTimestamp =
    seaTimes &&
    Math.min(
      Math.max(seaTimes.present + seaSteps * seaTimes.stepMs, seaTimes.earliest),
      seaTimes.latest,
    );
  const seaTime = useMemo(
    () => (seaTimestamp === undefined ? undefined : new Date(seaTimestamp)),
    [seaTimestamp],
  );
  // How tall the timeline is, and zero while it is not shown.
  const [timelineHeight, setTimelineHeight] = useState(0);
  const timelineRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => setTimelineHeight(node.offsetHeight));
    observer.observe(node);
    return () => {
      observer.disconnect();
      setTimelineHeight(0);
    };
  }, []);
  const seaPresent = seaTimes?.present;
  const onSeaTimeChange = useCallback(
    (time: number) => {
      if (seaPresent !== undefined) setSeaSteps(Math.round((time - seaPresent) / seaStepMs));
    },
    [seaPresent, seaStepMs],
  );

  // The id of what is selected: a station, a break or a spot.
  const selection = selectedId ?? selectedBreakId ?? selectedSpotId;
  const isAdding = panel === "add";
  // The marker is an account's to put: a visitor is asked for one first. It stays where it is
  // while the spot is being saved.
  const isPlacing = isAdding && signedIn;
  const canPlace = isPlacing && !adding.isSaving;
  // The spot being renamed or moved, in its own panel. It is left when another thing is opened.
  const [edit, setEdit] = useState<SpotEdit | null>(null);
  const editing = edit && edit.id === selectedSpotId && !isAdding ? edit : null;
  if (edit && !editing) setEdit(null);
  // How much of a phone's screen the sheet beside the map takes. It opens partly raised.
  const [sheetShare, setSheetShare] = useState(SHEET_SNAP_POINTS[0]!);
  if (selection === undefined && !isAdding && sheetShare !== SHEET_SNAP_POINTS[0]) {
    setSheetShare(SHEET_SNAP_POINTS[0]!);
  }

  // The selected break as the map draws it. The breaks in view hold it, unless it was opened by
  // its address: its place is then known once its panel has loaded.
  const loadedBreak = selected.found.data;
  const selectedBreak = useMemo<MapBreak | undefined>(() => {
    if (!selectedBreakId) return undefined;
    const inView = breaks.find((found) => found.id === selectedBreakId);
    if (inView) return inView;
    return loadedBreak?.id === selectedBreakId ? loadedBreak : undefined;
  }, [breaks, selectedBreakId, loadedBreak]);
  // The spots as the map draws them, and the selected one, which it draws as it does a break.
  // A spot that is being moved is drawn by its marker alone. A list shown alone has its own
  // spots, which may be someone else's.
  const mapSpots = useMemo(
    () => (listView?.spots ?? spots.data ?? []).filter((one) => one.id !== editing?.id),
    [listView?.spots, spots.data, editing?.id],
  );
  // The list whose sharing is open, by its id: the dialog follows what the API answers of it.
  const [sharingId, setSharingId] = useState<string>();
  const sharedList = lists.data?.find((list) => list.id === sharingId);
  // The spots of a list that only their owner sees today, which its link will show.
  const privateSpots = (list: SavedList | undefined) =>
    (list?.spotIds ?? []).filter(
      (id) => spots.data?.find((one) => one.id === id)?.publication?.status !== "accepted",
    ).length;

  // A list shown alone is brought into view once, when what it holds is known.
  const fitted = useRef<string>(undefined);
  const listPoints = useMemo(() => {
    if (!listView) return undefined;
    const stations = listView.stationIds.map((id) => savedStations.get(id));
    const found = listView.breakIds.map((id) => savedBreaks.get(id));
    const all = [...stations, ...found, ...listView.spots];
    // Every station and every break of the list has answered, or the map would move twice.
    return all.every((one) => one !== undefined) ? (all as MapPoint[]) : undefined;
  }, [listView, savedStations, savedBreaks]);
  useEffect(() => {
    if (!listView || !listPoints || fitted.current === listView.id) return;
    fitted.current = listView.id;
    // What is selected by the address stays where the map put it.
    if (listPoints.length > 0 && selection === undefined) map.current?.fit(listPoints);
  }, [listView, listPoints, selection]);
  if (!listView && fitted.current) fitted.current = undefined;
  const loadedSpot = selected.spot.data;
  const selectedSpot = loadedSpot?.id === selectedSpotId ? loadedSpot : undefined;

  // What a drawer covers of the map, so that a station is shown beside it and not under it.
  const padding = useMemo(() => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if ((!selection && !isAdding) || typeof window === "undefined") return none;
    return wide
      ? { ...none, right: SIDE_PANEL_WIDTH }
      : { ...none, bottom: Math.round(window.innerHeight * sheetShare) };
  }, [selection, isAdding, wide, sheetShare]);

  const { shown, drawn } = useShown(selection !== undefined, {
    id: selectedId,
    breakId: selectedBreakId,
    spotId: selectedSpotId,
    ...selected,
  });
  const rest = useDrawerRest(selection !== undefined);
  const shownBuoy = useShown(buoy.id !== undefined, {
    ...buoy,
    historyDays: HISTORY_DAYS,
    breakId: undefined,
    spotId: undefined,
    found: NO_BREAK,
    spot: NO_SPOT,
    nearby: undefined,
    nearbyWind: undefined,
  });
  const buoyRest = useDrawerRest(buoy.id !== undefined);

  // A panel is drawn again when what it shows changes, and not each time the map does.
  const tideExtend = useRef(onTideExtend);
  tideExtend.current = onTideExtend;
  const extendTide = useCallback((direction: -1 | 1) => tideExtend.current(direction), []);
  const historyExtend = useRef(onHistoryExtend);
  historyExtend.current = onHistoryExtend;
  const extendHistory = useCallback(() => historyExtend.current(), []);
  const buoyOpener = useRef(onOpenBuoy);
  buoyOpener.current = onOpenBuoy;
  const openBuoy = useCallback((stationId: string) => buoyOpener.current(stationId), []);
  const spotOffer = useRef(onSpotOfferSeen);
  spotOffer.current = onSpotOfferSeen;
  const seeSpotOffer = useCallback(() => spotOffer.current(), []);
  const spotDescriber = useRef(onDescribeSpot);
  spotDescriber.current = onDescribeSpot;
  const describeSpot = useCallback(
    (spot: Spot, said: SpotDescription, done: () => void) =>
      spotDescriber.current(spot, said, done),
    [],
  );
  const hasUnsavedAlert = alerting.hasUnsaved;
  const mayLeaveAlert = useCallback(() => !hasUnsavedAlert(), [hasUnsavedAlert]);
  // The alert that was last asked for from the list of alerts, the spot it is opened at, and
  // how many times one was.
  const [alertAsked, setAlertAsked] = useState<{
    spotId?: string;
    alertId?: string;
    count: number;
  }>({ count: 0 });
  const ownSpots = spots.data;
  const spotList = useMemo(() => ownSpots ?? [], [ownSpots]);
  // What only a spot's panel reads, so that a buoy's or a break's is not drawn again for it.
  const isNewSpot = drawn?.spotId !== undefined && drawn.spotId === newSpotId;
  const isDescribing = drawn?.spotId !== undefined && isDescribingSpot;
  const selectionPanel = useMemo(() => {
    if (!drawn) return null;
    if (drawn.spotId) {
      return (
        <SpotPanel
          key={drawn.spotId}
          now={now}
          spot={drawn.spot}
          forecast={drawn.forecast}
          tides={drawn.tides}
          extremes={drawn.extremes}
          onTideExtend={extendTide}
          nearby={drawn.nearby}
          nearbyWind={drawn.nearbyWind}
          onOpenBuoy={openBuoy}
          isNew={isNewSpot}
          onOfferSeen={seeSpotOffer}
          isDescribing={isDescribing}
          onDescribe={describeSpot}
          spots={spotList}
          alerting={alerting}
          alertAsked={drawn.spotId === alertAsked.spotId ? alertAsked : NO_ALERT_ASKED}
        />
      );
    }
    return drawn.breakId ? (
      <BreakPanel
        key={drawn.breakId}
        now={now}
        found={drawn.found}
        forecast={drawn.forecast}
        tides={drawn.tides}
        extremes={drawn.extremes}
        onTideExtend={extendTide}
        nearby={drawn.nearby}
        nearbyWind={drawn.nearbyWind}
        onOpenBuoy={openBuoy}
      />
    ) : (
      <StationPanel
        // A new station starts at the top, with its own charts.
        key={drawn.id}
        now={now}
        station={drawn.station}
        history={drawn.history}
        historyDays={drawn.historyDays}
        onHistoryExtend={extendHistory}
        forecast={drawn.forecast}
        tides={drawn.tides}
        extremes={drawn.extremes}
        onTideExtend={extendTide}
      />
    );
  }, [
    drawn,
    now,
    extendTide,
    extendHistory,
    openBuoy,
    isNewSpot,
    seeSpotOffer,
    isDescribing,
    describeSpot,
    spotList,
    alerting,
    alertAsked,
  ]);
  const drawnBuoy = shownBuoy.drawn;
  const buoyPanel = useMemo(
    () =>
      drawnBuoy && (
        <StationPanel
          key={drawnBuoy.id}
          now={now}
          station={drawnBuoy.station}
          history={drawnBuoy.history}
          forecast={drawnBuoy.forecast}
          tides={drawnBuoy.tides}
          extremes={drawnBuoy.extremes}
        />
      ),
    [drawnBuoy, now],
  );
  const buoyReading =
    shownBuoy.shown.history.data?.readings[0] ?? shownBuoy.shown.station?.latestReading;
  const shownBreak = shown.breakId ? shown.found : undefined;
  const shownReading = shown.history.data?.readings[0] ?? shown.station?.latestReading;
  const shownName = shown.history.data?.station.name ?? shown.station?.name;
  const shownSpot = shown.spotId ? shown.spot : undefined;
  const shownTitle = shownSpot
    ? (shownSpot.data?.name ?? (shownSpot.isError ? m.spot_title() : undefined))
    : shownBreak
      ? (shownBreak.data?.name ?? (shownBreak.isError ? m.break_title() : undefined))
      : shownName;

  function requireAccount(reason: string, then?: () => void) {
    promptAuth({ reason, onSignedIn: then });
  }

  // A spot is saved and deleted by its owner alone.
  const ownSpot = shownSpot?.data?.isOwner ? shownSpot.data : undefined;
  // A spot of someone else's is read in a list they shared, and may be copied.
  const sharedSpot = shownSpot?.data && !shownSpot.data.isOwner ? shownSpot.data : undefined;
  function copySpot() {
    if (!sharedSpot) return;
    if (signedIn) onCopySpot(sharedSpot);
    else requireAccount(m.auth_reason_copy_spot({ name: sharedSpot.name }));
  }
  // What the star and the menu of the panel save: the station, the break when it is known, or
  // the spot when it is the account's own.
  const shownItem: SavedItem | undefined = shown.breakId
    ? shown.found.data && { breakId: shown.breakId }
    : shown.id
      ? { stationId: shown.id }
      : ownSpot && { spotId: ownSpot.id };

  // Adding a spot takes an account, which a visitor is asked for first.
  function addSpot() {
    if (signedIn) onPanelChange("add");
    else requireAccount(m.auth_reason_add_spot(), () => onPanelChange("add"));
  }

  function toggleFavorite() {
    if (!shownItem) return;
    const item = shownItem;
    if (!signedIn) {
      requireAccount(m.auth_reason_save({ name: shownTitle ?? m.auth_reason_this_station() }), () =>
        onSave("favorites", item, true),
      );
      return;
    }
    const isFavorite = (lists.data ?? []).some((list) => list.isDefault && holds(list, item));
    onSave("favorites", item, !isFavorite);
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.error(m.locate_unsupported());
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setIsLocating(false);
        setUserLocation(point);
        map.current?.focus(point, 8);
      },
      (error) => {
        setIsLocating(false);
        toast.error(error.code === error.PERMISSION_DENIED ? m.locate_denied() : m.locate_failed());
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  }

  const accountPrompt = {
    onSignIn: () => promptAuth({ mode: "sign-in" }),
    onCreateAccount: () => promptAuth({ mode: "sign-up" }),
  };
  // A button that floats on the map: the outline button, on the theme's surface.
  const floating =
    "bg-neutral-1 [--edge-color:var(--neutral-10-transparent)] hover:bg-neutral-3 aria-expanded:bg-neutral-3";

  return (
    <div
      className="relative min-h-0 overflow-hidden"
      // On a phone the timeline takes the bottom of the map, and the map's credits sit above it.
      style={
        !wide && timelineHeight > 0
          ? ({
              "--map-credits-lift": `calc(${timelineHeight}px + var(--spacing-s) + env(safe-area-inset-bottom))`,
            } as CSSProperties)
          : undefined
      }
    >
      <StationMap
        ref={map}
        stations={mapStations}
        windStations={mapWindStations}
        breaks={layers.breaks ? breaks : []}
        spots={mapSpots}
        selectedId={selection}
        selectedBreak={editing ? undefined : (selectedSpot ?? selectedBreak)}
        selectedIsSpot={selectedSpot !== undefined}
        layers={layers}
        seaLayer={sea}
        seaTime={seaTime}
        theme={theme}
        padding={padding}
        userLocation={userLocation}
        userLocationLabel={m.locate_you_are_here()}
        onSelect={onSelect}
        onSelectBreak={onSelectBreak}
        onSelectSpot={onSelectSpot}
        onBoundsChange={onBoundsChange}
        draft={isPlacing ? adding.draft.point : (editing?.point ?? null)}
        draftLabel={editing ? m.spot_marker_label_move() : m.spot_marker_label()}
        placing={isPlacing || editing !== null}
        onPlace={
          canPlace
            ? adding.onPlace
            : editing && !isChangingSpot
              ? (point) => setEdit({ ...editing, point })
              : undefined
        }
      />

      {/* The map says which list it shows alone. A press opens the list. */}
      {listView && panel !== "saved" && (
        <div
          className={cn(
            "absolute left-1/2 flex max-w-[70vw] -translate-x-1/2 items-center gap-xxs",
            // Under the legend on a phone, where the legend is at the top.
            wide ? "top-s" : "top-[4.75rem]",
          )}
        >
          <Button
            variant="outline"
            size="sm"
            className={cn(floating, "min-w-0")}
            onClick={() => onPanelChange("saved")}
          >
            <ListsIcon data-slot="icon" aria-hidden />
            <span className="truncate">{listName(listView)}</span>
          </Button>
          {/* Back to the whole map, for an account: a visitor has the list alone. */}
          {onExitList && (
            <Button
              variant="outline"
              size="icon-sm"
              className={floating}
              aria-label={m.list_exit()}
              onClick={onExitList}
            >
              <XIcon data-slot="icon" aria-hidden />
            </Button>
          )}
        </div>
      )}

      {(waveStations.isPending || waveStations.isError) && !listView && (
        <p
          role="status"
          className={cn(
            "edge absolute left-1/2 flex -translate-x-1/2 items-center gap-xs rounded-full bg-neutral-1 px-s py-xxs text-s whitespace-nowrap [--edge-color:var(--neutral-10-transparent)]",
            // Under the legend on a phone, where the legend is at the top.
            wide ? "top-s" : "top-[4.75rem]",
          )}
        >
          {waveStations.isPending && <Spinner className="size-3.5" />}
          {waveStations.isPending ? m.map_loading() : m.map_load_failed()}
        </p>
      )}

      <div
        // Beside the station's panel when it is open, not under it.
        className="absolute top-s right-s grid gap-xs transition-[translate] duration-(--motion-large-duration) ease-theme-large"
        style={{ translate: `${-padding.right}px 0` }}
      >
        <Button
          variant="outline"
          size="icon"
          className={floating}
          aria-label={m.spot_add()}
          aria-pressed={isAdding}
          onClick={addSpot}
        >
          <PinPlusIcon data-slot="icon" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={floating}
          aria-label={m.locate_me()}
          aria-pressed={userLocation !== null}
          isPending={isLocating}
          onClick={locate}
        >
          <LocateIcon data-slot="icon" aria-hidden />
        </Button>
        <div className="grid gap-xxs max-sm:hidden">
          <Button
            variant="outline"
            size="icon"
            className={floating}
            aria-label={m.map_zoom_in()}
            onClick={() => map.current?.zoomBy(1)}
          >
            <PlusIcon data-slot="icon" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={floating}
            aria-label={m.map_zoom_out()}
            onClick={() => map.current?.zoomBy(-1)}
          >
            <MinusIcon data-slot="icon" aria-hidden />
          </Button>
        </div>
      </div>

      <MapLegend
        // At the top on a phone: the bottom is where the sheets rise and where the credits are.
        className={cn("absolute left-s", wide ? "bottom-s" : "top-s")}
        opens={wide ? "up" : "down"}
        layers={layers}
        onLayersChange={onLayersChange}
        expanded={legendChoice ?? wide}
        onExpandedChange={setLegendChoice}
        windTruncated={windTruncated}
        breaksTruncated={breaksTruncated}
      />

      {/* The sea's timeline runs along the bottom of the map: beside the legend on a wide screen,
          across a phone. A drawer opens over it, and it does not move. On a wide screen it leaves
          the corner to the button of the map's credits. */}
      {layers.sea && seaTime && seaTimes && (
        <SeaTimeline
          ref={timelineRef}
          className={cn(
            "absolute",
            wide
              ? "right-[calc(var(--spacing-s)+2.5rem)] bottom-s left-[calc(var(--spacing-s)*2+16rem)] max-w-160"
              : "inset-x-s bottom-[calc(var(--spacing-s)+env(safe-area-inset-bottom))]",
          )}
          time={seaTime}
          times={seaTimes}
          onTimeChange={onSeaTimeChange}
        />
      )}

      <ViewerDrawer
        open={selection !== undefined}
        identity={
          selectedId
            ? `station:${selectedId}`
            : selectedBreakId
              ? `break:${selectedBreakId}`
              : `spot:${selectedSpotId}`
        }
        onOpenChange={(open) => {
          if (!open) onSelect(undefined);
        }}
        wide={wide}
        alongside
        onSnapChange={setSheetShare}
        onRest={rest.onRest}
        // An alert that is written and not saved keeps its panel open until it is answered for.
        mayDismiss={mayLeaveAlert}
        title={shownTitle ?? <Skeleton className="h-(--line-l) w-48 rounded-(--radius-xs)" />}
        description={
          shown.spotId ? (
            shown.spot.data ? (
              shown.spot.data.isOwner ? (
                // A spot is its owner's alone, and says what became of a request to make it
                // public: decision 034.
                shown.spot.data.publication?.status === "pending" ? (
                  m.spot_pending()
                ) : shown.spot.data.publication?.status === "accepted" ? (
                  m.spot_accepted()
                ) : (
                  <span className="inline-flex items-start gap-xxs">
                    <LockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {shown.spot.data.publication?.status === "refused"
                      ? m.spot_refused({ reason: shown.spot.data.publication.reason ?? "" })
                      : m.spot_own()}
                  </span>
                )
              ) : (
                m.spot_shared()
              )
            ) : (
              !shown.spot.isError && (
                <Skeleton className="h-(--line-s) w-24 rounded-(--radius-xs)" />
              )
            )
          ) : shown.breakId ? (
            // A break links to the page it was read on, when the instance knows one.
            shown.found.data?.source.url ? (
              <a
                className="underline underline-offset-2 hover:text-neutral-10"
                href={shown.found.data.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {m.break_from_catalogue()}
              </a>
            ) : shown.found.data ? (
              m.break_title()
            ) : (
              !shown.found.isError && (
                <Skeleton className="h-(--line-s) w-32 rounded-(--radius-xs)" />
              )
            )
          ) : shown.station || shown.history.data ? (
            <ReadingAge
              observedAt={shownReading?.observedAt}
              freshness={freshnessOf(shownReading?.observedAt, now)}
              now={now}
            />
          ) : (
            <Skeleton className="h-(--line-s) w-24 rounded-(--radius-xs)" />
          )
        }
        actions={
          // A spot that is being renamed or moved has its two buttons in its panel.
          !editing && (
            <>
              {shownItem && (
                <StationActions
                  item={shownItem}
                  lists={signedIn ? (lists.data ?? []) : undefined}
                  onToggleFavorite={toggleFavorite}
                  onToggleList={(list, add) => onSave(list.id, shownItem, add)}
                  onCreateList={(name) => onCreateList(name, shownItem)}
                  onManageLists={() => onPanelChange("saved")}
                />
              )}
              {sharedSpot && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.spot_copy({ name: sharedSpot.name })}
                  isPending={isCopyingSpot}
                  onClick={copySpot}
                >
                  <PinPlusIcon data-slot="icon" aria-hidden />
                </Button>
              )}
              {ownSpot && (
                <SpotActions
                  key={ownSpot.id}
                  spot={ownSpot}
                  onEdit={() =>
                    setEdit({
                      id: ownSpot.id,
                      name: ownSpot.name,
                      point: { latitude: ownSpot.latitude, longitude: ownSpot.longitude },
                    })
                  }
                  onPublish={(note, done) => onPublishSpot(ownSpot, note, done)}
                  onCancelPublication={() => onCancelPublication(ownSpot)}
                  isAsking={isAskingPublication}
                  isDeleting={isDeletingSpot}
                  onDelete={() => onDeleteSpot(ownSpot)}
                />
              )}
            </>
          )
        }
      >
        {editing && ownSpot && (
          <SpotEditor
            edit={editing}
            onNameChange={(name) => setEdit({ ...editing, name })}
            isSaving={isChangingSpot}
            onSave={() =>
              onChangeSpot(ownSpot, { name: editing.name.trim(), ...editing.point }, () =>
                setEdit(null),
              )
            }
            onCancel={() => setEdit(null)}
          />
        )}
        {/* The panel stays under what renames or moves its spot, out of sight: what is being
            written in it, of an alert or of the spot, is still there afterwards. */}
        <div className={editing && ownSpot ? "hidden" : "contents"}>
          <ChartsAtRest value={rest.atRest}>{selectionPanel}</ChartsAtRest>
        </div>
      </ViewerDrawer>

      <ViewerDrawer
        open={buoy.id !== undefined}
        identity={buoy.id}
        onOpenChange={(open) => {
          if (!open) onOpenBuoy(undefined);
        }}
        wide={wide}
        onRest={buoyRest.onRest}
        title={
          shownBuoy.shown.history.data?.station.name ??
          shownBuoy.shown.station?.name ?? (
            <Skeleton className="h-(--line-l) w-48 rounded-(--radius-xs)" />
          )
        }
        description={
          <ReadingAge
            observedAt={buoyReading?.observedAt}
            freshness={freshnessOf(buoyReading?.observedAt, now)}
            now={now}
          />
        }
      >
        <ChartsAtRest value={buoyRest.atRest}>{buoyPanel}</ChartsAtRest>
      </ViewerDrawer>

      <ViewerDrawer
        open={isAdding}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        alongside
        onSnapChange={setSheetShare}
        title={m.spot_new_title()}
      >
        {signedIn ? (
          <NewSpotPanel
            query={adding.query}
            onQueryChange={adding.onQueryChange}
            search={adding.search}
            onPick={(found) => {
              adding.onPick(found);
              map.current?.focus(found, PLACE_ZOOM);
            }}
            draft={adding.draft}
            onNameChange={adding.onNameChange}
            near={adding.near}
            onOpenSpot={onSelectSpot}
            isFull={adding.isFull}
            isSaving={adding.isSaving}
            onSave={adding.onSave}
          />
        ) : (
          <AccountPrompt text={m.spot_sign_in_prompt()} {...accountPrompt} />
        )}
      </ViewerDrawer>

      <ViewerDrawer
        open={panel === "saved"}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        // An account goes from one list to another by the chips of the panel, which stays the
        // panel of what it saved. A visitor has one list, which gives the panel its name.
        title={listView && !onExitList ? listName(listView) : m.saved_title()}
        description={
          listView && (listView.access === "owner" ? m.list_alone_own() : m.list_alone_shared())
        }
      >
        {listView ? (
          <ListPanel
            now={now}
            list={listView}
            stations={savedStations}
            breaks={savedBreaks}
            onSelect={onSelect}
            onSelectBreak={onSelectBreak}
            onSelectSpot={onSelectSpot}
            signedIn={signedIn}
            onKeep={onKeepList}
            isKeeping={isKeepingList}
            onLeave={onLeaveList}
            onShare={() => setSharingId(listView.id)}
            {...accountPrompt}
            lists={lists.data ?? []}
            joined={joined}
            onPick={onExitList && ((id) => (id ? onViewList(id) : onExitList()))}
          />
        ) : (
          <SavedPanel
            now={now}
            signedIn={signedIn}
            lists={lists}
            stations={savedStations}
            breaks={savedBreaks}
            spots={spots}
            onSelectSpot={onSelectSpot}
            onAddSpot={addSpot}
            onSelect={onSelect}
            {...accountPrompt}
            onSelectBreak={onSelectBreak}
            onRemove={(list, item) => onSave(list.id, item, false)}
            onCreateList={onCreateList}
            onDeleteList={onDeleteList}
            onViewList={onViewList}
            onShareList={(list) => setSharingId(list.id)}
            joined={joined}
          />
        )}
      </ViewerDrawer>

      <ShareListDialog
        list={sharedList}
        onClose={() => setSharingId(undefined)}
        privateSpots={privateSpots(sharedList)}
        isSaving={sharing.isSaving}
        onShare={(password) => sharedList && sharing.onShare(sharedList, password)}
        onRenew={() => sharedList && sharing.onRenew(sharedList)}
        onStop={() => {
          if (sharedList) sharing.onStop(sharedList);
          setSharingId(undefined);
        }}
      />

      <ViewerDrawer
        open={panel === "alerts"}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        title={m.alerts_title()}
      >
        <AlertsPanel
          now={now}
          signedIn={signedIn}
          tab={alertsTab}
          onTabChange={onAlertsTabChange}
          notifications={notifications}
          alerts={alerting.alerts}
          spots={spotList}
          settings={alerting.settings}
          deviceZone={alerting.deviceZone}
          {...accountPrompt}
          onRead={onReadNotification}
          onOpenAlert={(alert) => {
            const [first] = alert.spotIds;
            if (!first) return;
            setAlertAsked((asked) => ({
              spotId: first,
              alertId: alert.id,
              count: asked.count + 1,
            }));
            onSelectSpot(first);
          }}
          switching={alerting.switching}
          onSwitchAlert={alerting.onSwitch}
          onSettingsChange={alerting.onSettingsChange}
        />
      </ViewerDrawer>
    </div>
  );
}
