import { Button } from "@repo/ui/components/ui/button";
import { MenuItem } from "@repo/ui/components/ui/menu";
import { LeaveDialog } from "@/components/alerts/leave-dialog";
import { hasUnsaved } from "@/lib/unsaved";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  BellIcon,
  ListsIcon,
  LocateIcon,
  LockIcon,
  MinusIcon,
  PinPlusIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import {
  type CSSProperties,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { AccountPanel } from "@/components/account/account-panel";
import { AlertPlaceSheet } from "@/components/alerts/alert-place-sheet";
import { AlertSettingsForm } from "@/components/alerts/alert-settings";
import { useAuthPrompt } from "@/components/auth/auth-prompt";
import {
  type FoundPlace,
  NewSpotPanel,
  type SpotDraft,
  type SpotSearch,
} from "@/components/spots/new-spot-panel";
import type { Alerting } from "@/components/alerts/types";
import { FriendsPanel } from "@/components/friends/friends-panel";
import { InviteDialog } from "@/components/friends/invite-dialog";
import type { Friending, Invitation } from "@/components/friends/types";
import { ContributionsPanel } from "@/components/guides/contributions-panel";
import { LogbookPanel } from "@/components/sessions/logbook-panel";
import { PlaceSessions } from "@/components/sessions/place-sessions";
import { SessionSheet } from "@/components/sessions/session-sheet";
import type { SessionPlace, Sessioning } from "@/components/sessions/types";
import { openCommandPalette } from "@/components/shared/command-palette";
import type { Guiding } from "@/components/guides/types";
import type { SpotDescription } from "@/components/spots/spot-guide";
import { ListChips } from "@/components/lists/list-chips";
import { ListPanel } from "@/components/lists/list-panel";
import { ShareListDialog } from "@/components/lists/share-dialog";
import { type SpotEdit, SpotEditor } from "@/components/spots/spot-editor";
import { SpotActions } from "@/components/spots/spot-menu";
import { SpotPanel } from "@/components/spots/spot-panel";
import { closeCreateMenu, useCreateMenu } from "@/lib/create-menu";
import { compassPoint, formatAgo, formatSeconds, freshnessOf, toKnots } from "@/lib/format";
import { isTabPanel } from "@/lib/phone-nav";
import type { Recent } from "@/lib/recents";
import { formatHeight, formatWind, useUnits } from "@/lib/units";
import type { Pushing } from "@/lib/use-push";
import { useStoredState } from "@/lib/use-stored-state";
import { m } from "@/paraglide/messages.js";

import { AlertsPanel, type AlertsTab } from "./alerts-panel";
import { BreakPanel } from "./break-panel";
import { ChartsAtRest, useDrawerRest } from "./chart-turns";
import { CreateSheet } from "./create-sheet";
import { DirectionsActions, DirectionsItems } from "./directions-actions";
import { PlaceMenu } from "./place-menu";
import { SharePlace } from "./share-place";
import type { Nearby, NearbyWind } from "./details/parts";
import { HISTORY_DAYS } from "./details/wind";
import { MapLegend } from "./map-legend";
import {
  type Found,
  PlaceSearch,
  type PlaceSearching,
  SEARCH_BODY,
  SEARCH_HEAD,
} from "./place-search";
import { AccountPrompt, RecentPlaces, SavedPanel } from "./saved-panel";
import { SeaTimeline, type SeaTimes } from "./sea-timeline";
import { SEA_TIMELINE_SHOWN } from "./sea-timeline-shown";
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
  type Guide,
  type GuideOwn,
  type ConnectedAgents,
  type JoinedList,
  type ListView,
  type Loadable,
  type SavedBreak,
  type SavedItem,
  type SavedList,
  type Session,
  type Spot,
  type Standing,
  type Station,
  type StationReadings,
  type SurfBreak,
  type TideExtremes,
  type TideTimeline,
  periodOf,
} from "./types";
import { NO_SHEET, ViewerDrawer, sidePanelWidth, useScreenWidth } from "./viewer-drawer";
import { ViewerTab } from "./viewer-screen";

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

// "add" is the panel that adds a spot. It stands beside the map, which takes the marker. The
// others are the tabs of a phone's bar, and drawers over the map on a wide screen.
export type ViewerPanel = "saved" | "alerts" | "account" | "add";
/** The part of the account's panel that is one step into it: how to be told of the alerts. */
export type SettingsPart = "alerts" | "contributions" | "friends" | "sessions";
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
  // The marker was put somewhere on the map, on a break of the catalogue or not. A break the
  // map has not loaded gives its name with it.
  onPlace: (point: MapPoint, breakId?: string, name?: string) => void;
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
    // What is written of the selected break, and what the reader wrote of it.
    guide: Loadable<Guide>;
    own: GuideOwn | undefined;
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
  // The search of the map by a name, which a phone shows as a screen of its own.
  search: PlaceSearching & { isOpen: boolean; onOpenChange: (open: boolean) => void };
  // The account's log of its sessions, and the search that finds where one was: decision 043.
  sessioning: Sessioning;
  sessionSearch: PlaceSearching;
  // The search that finds where a new alert goes, in a sheet of its own.
  alertSearch: PlaceSearching & { isOpen: boolean; onOpenChange: (open: boolean) => void };
  // Begins an alert at a break: at the account's spot there, made first when it has none.
  onAlertAtBreak: (breakId: string) => void;
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
  // What the page of a break asked the map to begin: an alert, at the spot named, or at the
  // account's spot of the break named, made first when it has none. `onWanted` says it was
  // begun, or is in hand. Decision 059.
  wants?: { breakId?: string; spotId?: string };
  onWanted?: () => void;
  lists: Loadable<SavedList[]>;
  // The stations and the surf breaks the lists name, by id.
  savedStations: Map<string, Station>;
  savedBreaks: Map<string, SavedBreak>;
  // What the reader looked at last: the saved panel lists it, and the map makes more of its
  // breaks.
  recents: Recent[];
  onClearRecents: () => void;
  notifications: Loadable<AlertNotification[]>;
  // The alerts of the account, its settings, and what the screens do with them.
  alerting: Alerting;
  // What the guide of a break does for its reader: decision 041.
  guiding: Guiding;
  // Whether the address asks for the guide of the break it selects, what says so, and what
  // opens the guide of another break.
  guideAsked: boolean;
  onGuideAsked: (asked: boolean) => void;
  onOpenGuide: (breakId: string) => void;
  // The account's link and its friends, and the link the address names, if it names one.
  friending: Friending;
  invitation: Invitation | undefined;
  // Push on this device, and the account's devices.
  push: Pushing;
  // The part of the alerts panel in view.
  alertsTab: AlertsTab;
  onAlertsTabChange: (tab: AlertsTab) => void;
  // Who is signed in, for the account's panel. No user for a visitor.
  account: {
    // `username` is null for an account that has chosen none, and undefined while the API has
    // not said.
    user: { name: string; email: string; username?: string | null } | undefined;
    // Given when the account's address is not checked yet, on an instance that checks addresses.
    check?: { isSending: boolean; onSend: () => void };
    onUsernameSave: (username: string) => Promise<string | undefined>;
    // What the account wrote in the guides, and where it stands.
    standing: Loadable<Standing>;
    // How many friends it has, once the API has said.
    friendCount: number | undefined;
    // The assistants it signed in to read it, and what disconnects one. Decision 047.
    agents: ConnectedAgents;
    onSignOut: () => void;
  };
  // The part of the account's panel in view, when it is not its first screen. Asking for one
  // opens the panel on it.
  settingsPart: SettingsPart | undefined;
  onSettingsPartChange: (part: SettingsPart | undefined) => void;
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
  // Shows a list alone on the map, or everything again, from the map itself: the saved panel
  // stays closed. Undefined for whoever reads a list by its link.
  onShowList: ((listId: string | undefined) => void) | undefined;
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
    sameLoadable(one.guide, other.guide) &&
    one.own === other.own &&
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
const NO_GUIDE: Loadable<Guide> = { data: undefined, isPending: false, isError: false };

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

// A panel that holds something written and not saved stays open while that is asked about.
const mayDismissSelection = () => !hasUnsaved();

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
  search,
  sessioning,
  sessionSearch,
  alertSearch,
  onAlertAtBreak,
  onTideExtend,
  onHistoryExtend,
  buoy,
  onOpenBuoy,
  panel,
  signedIn,
  wants,
  onWanted,
  lists,
  savedStations,
  savedBreaks,
  recents,
  onClearRecents,
  notifications,
  alerting,
  guiding,
  guideAsked,
  onGuideAsked,
  onOpenGuide,
  friending,
  invitation,
  push,
  alertsTab,
  onAlertsTabChange,
  account,
  settingsPart,
  onSettingsPartChange,
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
  onShowList,
  onKeepList,
  isKeepingList,
  onLeaveList,
  sharing,
  onCopySpot,
  isCopyingSpot,
  onReadNotification,
}: ViewerProps) {
  const map = useRef<StationMapHandle>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const promptAuth = useAuthPrompt();
  const [userLocation, setUserLocation] = useState<MapPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  // How many steps of the model the sea is shown ahead of now.
  const [seaSteps, setSeaSteps] = useState(0);
  // Unfolded on a wide screen, folded on a phone, until the visitor chooses.
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null);
  // The account's lists on the map are folded behind their button until they are asked for.
  const [listsOpen, setListsOpen] = useState(false);
  const listsId = useId();
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
  // On a wide screen a panel opens over what is selected. A phone shows a tab's panel as the
  // whole screen, in place of the map: decision 040. What is selected is read on the map, so
  // an address that names both shows the selection there.
  const opened = wide || selection === undefined ? panel : undefined;
  const isScreen = !wide && isTabPanel(opened);
  // The marker is an account's to put: a visitor is asked for one first. It stays where it is
  // while the spot is being saved.
  const isPlacing = isAdding && signedIn;
  const canPlace = isPlacing && !adding.isSaving;
  // The spot being renamed or moved, in its own panel. It is left when another thing is opened.
  const [edit, setEdit] = useState<SpotEdit | null>(null);
  const editing = edit && edit.id === selectedSpotId && !isAdding ? edit : null;
  if (edit && !editing) setEdit(null);
  // What is selected, as its drawer knows it.
  const identity = selectedId
    ? `station:${selectedId}`
    : selectedBreakId
      ? `break:${selectedBreakId}`
      : selectedSpotId
        ? `spot:${selectedSpotId}`
        : undefined;
  // What a phone's sheet beside the map takes of the screen: the one of what is selected, or the
  // one that adds a spot. Each says so as it opens, is raised, and begins to leave.
  const [selectionSheet, setSelectionSheet] = useState(NO_SHEET);
  const [addingSheet, setAddingSheet] = useState(NO_SHEET);
  const sheet = selectionSheet.height > 0 ? selectionSheet : addingSheet;
  // What was pressed on the map opens a sheet that leaves the map in view, to press another.
  // What was chosen anywhere else, in a list, a search or an address, is there to be read: its
  // sheet opens raised. A press is forgotten once what it opened is left.
  const [pressed, setPressed] = useState<string>();
  const [seen, setSeen] = useState(identity);
  if (seen !== identity) {
    setSeen(identity);
    if (seen === pressed) setPressed(undefined);
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
  // The breaks as the map draws them: those looked at last stand out, and are drawn whether
  // they are among those in view or not, since from afar the map is given some of them only. A
  // list shown alone is drawn as it is.
  const mapBreaks = useMemo<MapBreak[]>(() => {
    const looked = recents.filter((recent) => recent.kind === "break");
    if (listView || looked.length === 0) return breaks;
    const ids = new Set(looked.map((recent) => recent.id));
    return [
      ...breaks.filter((found) => !ids.has(found.id)),
      ...looked.map(({ id, name, latitude, longitude }) => ({
        id,
        name,
        latitude,
        longitude,
        recent: true,
      })),
    ];
  }, [breaks, recents, listView]);
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

  // Whether the panel of what is selected, or of a buoy, is widened on a wide screen, for its
  // week's table: kept in the browser.
  const [widened, setWidened] = useStoredState("tonnr:panel-widened", false, (stored) =>
    typeof stored === "boolean" ? stored : null,
  );
  const screenWidth = useScreenWidth();

  // What a drawer covers of the map, so that a station is shown beside it and not under it.
  const padding = useMemo(() => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if ((!selection && !isAdding) || typeof window === "undefined") return none;
    if (!wide) return { ...none, bottom: sheet.height };
    // The panel that adds a spot is never widened.
    return { ...none, right: sidePanelWidth(widened && !isAdding, screenWidth) };
  }, [selection, isAdding, wide, sheet.height, widened, screenWidth]);

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
    guide: NO_GUIDE,
    own: undefined,
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
  const guideAsker = useRef(onGuideAsked);
  guideAsker.current = onGuideAsked;
  const askGuide = useCallback((asked: boolean) => guideAsker.current(asked), []);
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
  // The alert that was last asked for from elsewhere, the spot it is opened at, and how many
  // times one was: one of the list of alerts, or a new one, which the "+" of a phone's bar
  // begins. A new one is begun once: its panel says when it has.
  const [alertAsked, setAlertAsked] = useState<{
    spotId?: string;
    alertId?: string;
    isNew?: boolean;
    count: number;
  }>({ count: 0 });
  const beginAlert = useCallback(
    () => setAlertAsked((asked) => (asked.isNew ? { ...asked, isNew: false } : asked)),
    [],
  );
  // What the tab of the sessions asks for, the same from one render to the next: the panel that
  // holds it is not drawn again each time the map moves.
  const sessions = useRef(sessioning);
  sessions.current = sessioning;
  const prompt = useRef(promptAuth);
  prompt.current = promptAuth;
  const isSignedIn = useRef(signedIn);
  isSignedIn.current = signedIn;
  // A session is an account's: a visitor is asked for one, then goes on to it.
  const beginSession = useCallback((place?: SessionPlace) => {
    if (isSignedIn.current) sessions.current.onBegin(place);
    else {
      prompt.current({
        reason: m.auth_reason_add_session(),
        onSignedIn: () => sessions.current.onBegin(place),
      });
    }
  }, []);
  const openSession = useCallback((session: Session) => sessions.current.onOpen(session), []);
  const signIn = useCallback(() => prompt.current({ mode: "sign-in" }), []);
  const createAccount = useCallback(() => prompt.current({ mode: "sign-up" }), []);
  const sessionsHere = sessioning.here;
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
          onAlertBegun={beginAlert}
          sessions={(onAlert) => {
            const spot = drawn.spot.data;
            return (
              spot && (
                <PlaceSessions
                  now={now}
                  signedIn={signedIn}
                  sessions={sessionsHere}
                  onAdd={() => beginSession({ kind: "spot", id: spot.id, name: spot.name })}
                  onOpen={openSession}
                  onSignIn={signIn}
                  onCreateAccount={createAccount}
                  onAlert={onAlert}
                />
              )
            );
          }}
        />
      );
    }
    return drawn.breakId ? (
      <BreakPanel
        key={drawn.breakId}
        now={now}
        found={drawn.found}
        guide={drawn.guide}
        own={drawn.own}
        guiding={guiding}
        guideAsked={guideAsked}
        onGuideAsked={askGuide}
        forecast={drawn.forecast}
        tides={drawn.tides}
        extremes={drawn.extremes}
        onTideExtend={extendTide}
        nearby={drawn.nearby}
        nearbyWind={drawn.nearbyWind}
        onOpenBuoy={openBuoy}
        sessions={
          drawn.found.data && (
            <PlaceSessions
              now={now}
              signedIn={signedIn}
              sessions={sessionsHere}
              onAdd={() =>
                drawn.found.data &&
                beginSession({
                  kind: "break",
                  id: drawn.found.data.id,
                  name: drawn.found.data.name,
                })
              }
              onOpen={openSession}
              onSignIn={signIn}
              onCreateAccount={createAccount}
            />
          )
        }
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
    beginAlert,
    guiding,
    guideAsked,
    askGuide,
    signedIn,
    sessionsHere,
    beginSession,
    openSession,
    signIn,
    createAccount,
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
  // Where a map app is asked to lead: a surf break or a spot, once it is read. A station has no
  // way to it.
  const shownPlace = shownSpot?.data ?? shownBreak?.data;
  // What the bookmark and the menu of the panel save: the station, the break when it is known, or
  // the spot when it is the account's own.
  const shownItem: SavedItem | undefined = shown.breakId
    ? shown.found.data && { breakId: shown.breakId }
    : shown.id
      ? { stationId: shown.id }
      : ownSpot && { spotId: ownSpot.id };

  // What a link sends to anyone: a break of the catalogue or a station. A spot is its owner's.
  const sharedPlace = shown.breakId
    ? shown.found.data && { breakId: shown.breakId }
    : shown.id && { stationId: shown.id };

  // An alert begun from the panel: at the account's own spot, in its editor, and at a break as its
  // page begins one, a visitor asked for an account first. A station takes none.
  const alertBreak = shownBreak?.data;
  const alertHere = ownSpot
    ? () => createAlert(ownSpot.id)
    : alertBreak
      ? () => {
          const at = () => onAlertAtBreak(alertBreak.id);
          if (signedIn) at();
          else requireAccount(m.auth_reason_add_alert(), at);
        }
      : undefined;

  // Adding a spot takes an account, which a visitor is asked for first.
  function addSpot() {
    if (signedIn) onPanelChange("add");
    else requireAccount(m.auth_reason_add_spot(), () => onPanelChange("add"));
  }

  // What the "+" of a phone's bar opens, and what it begins. The sheet closes first: what is
  // begun takes its place.
  const isCreating = useCreateMenu();
  function createSpot() {
    closeCreateMenu();
    addSpot();
  }
  function createAlert(spotId?: string) {
    closeCreateMenu();
    // An alert is an account's: a visitor is asked for one, then for the spot it goes on.
    if (!signedIn) {
      requireAccount(m.auth_reason_add_alert(), openAlertPlace);
      return;
    }
    if (!spotId) {
      openAlertPlace();
      return;
    }
    alertSearch.onOpenChange(false);
    setAlertAsked((asked) => ({ spotId, isNew: true, count: asked.count + 1 }));
    onSelectSpot(spotId);
  }

  // The sheet that asks where an alert goes opens with its field focused, in the same turn as the
  // press, so that a phone opens its keyboard: as the search of the map does.
  const alertInput = useRef<HTMLInputElement>(null);
  function openAlertPlace() {
    flushSync(() => alertSearch.onOpenChange(true));
    alertInput.current?.focus({ preventScroll: true });
  }
  function alertAtBreak(breakId: string) {
    const mine = ownSpots?.find((spot) => spot.breakId === breakId);
    if (mine) {
      createAlert(mine.id);
      return;
    }
    alertSearch.onOpenChange(false);
    onAlertAtBreak(breakId);
  }

  // An alert asked from the page of a break: a visitor is asked for an account once, an
  // account with a spot at the break opens the editor there, and one without is led to make
  // the spot at the break, after which the route asks again with the spot. Decision 059.
  const asked = useRef<string | null>(null);
  const wantedBreak = wants?.breakId ? shownBreak : undefined;
  useEffect(() => {
    // An alert asked again at the same place, once the first is begun, is asked anew.
    if (!wants || !onWanted) {
      asked.current = null;
      return;
    }
    const key = `${wants.breakId ?? ""}/${wants.spotId ?? ""}/${signedIn}`;
    if (asked.current === key) return;
    if (!signedIn) {
      asked.current = key;
      requireAccount(m.auth_reason_add_alert());
      return;
    }
    if (wants.spotId) {
      asked.current = key;
      createAlert(wants.spotId);
      onWanted();
      return;
    }
    if (ownSpots === undefined) return;
    const mine = ownSpots.find((spot) => spot.breakId === wants.breakId);
    if (mine) {
      asked.current = key;
      createAlert(mine.id);
      onWanted();
      return;
    }
    const at = wantedBreak?.data;
    if (!at) return;
    asked.current = key;
    onPanelChange("add");
    adding.onPlace({ latitude: at.latitude, longitude: at.longitude }, at.id, at.name);
  });

  // A phone searches in a sheet, and a wide screen in the command palette, where a spot is
  // found by its name too.
  const isSearching = search.isOpen && !wide;
  function openSearch() {
    if (wide) {
      openCommandPalette();
      return;
    }
    // A phone opens its keyboard for a field that takes the focus while the press is still
    // being answered: the sheet is drawn at once, and its field is focused in the same turn.
    // The field is still under the screen while the sheet rises, and Safari would scroll the page
    // to bring it into view: the sheet would then rest with the page scrolled under it, blank but
    // for its last line, until a touch put the page back.
    flushSync(() => search.onOpenChange(true));
    searchInput.current?.focus({ preventScroll: true });
  }
  // What was found opens as a press on the map opens it. A place has no panel: the map goes there.
  function pickFound(found: Found) {
    search.onOpenChange(false);
    if (found.kind === "place" || !found.id) map.current?.focus(found, PLACE_ZOOM);
    else if (found.kind === "spot") onSelectSpot(found.id);
    else if (found.kind === "break") onSelectBreak(found.id);
    else onSelect(found.id);
  }

  // A session begun from the "+" is at the place in view when it is one a session can be at:
  // a break, or a spot of the account's own. Otherwise its sheet asks where. What the panel last
  // showed stays drawn while it leaves, and is no place in view.
  function createSession() {
    closeCreateMenu();
    if (selection === undefined) {
      beginSession();
      return;
    }
    const at = shown.breakId ? shown.found.data : undefined;
    beginSession(
      at
        ? { kind: "break", id: at.id, name: at.name }
        : ownSpot
          ? { kind: "spot", id: ownSpot.id, name: ownSpot.name }
          : undefined,
    );
  }
  // A place of the log opens on the map, as a press on it does.
  function openPlace(place: { breakId: string } | { spotId: string }) {
    if ("spotId" in place) onSelectSpot(place.spotId);
    else onSelectBreak(place.breakId);
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
  // How to be told of the alerts is an account's: a visitor has the account's first screen.
  const alertSettings = settingsPart === "alerts" && signedIn;
  const ownContributions = settingsPart === "contributions" && signedIn;
  const ownFriends = settingsPart === "friends" && signedIn;
  const ownSessions = settingsPart === "sessions" && signedIn;
  // A button that floats on the map: the outline button, on the theme's surface.
  const floating =
    "bg-neutral-1 [--edge-color:var(--neutral-10-transparent)] hover:bg-neutral-3 aria-expanded:bg-neutral-3";
  // Where the map says something of itself: at the top and in the middle, under the header. On
  // a phone it stands over the legend, at the bottom of the map.
  const said = wide
    ? "absolute top-[calc(var(--spacing-s)+var(--app-header-lift,0px))] left-1/2 -translate-x-1/2"
    : undefined;
  // On a phone the map's buttons and its legend stand at the bottom of the map, under the thumb:
  // over the bar of tabs, and over a sheet that is open beside the map. A sheet that is raised
  // leaves them no room, and covers them where they stand: they go down with it when it leaves.
  const isCovered = !wide && padding.bottom > 0 && sheet.raised;
  const foot = cn(
    "bottom-[calc(var(--map-floor)+var(--spacing-s))]",
    "transition-[bottom,opacity] duration-(--motion-large-duration) ease-theme-large motion-reduce:transition-none",
    isCovered && "opacity-0",
  );

  // The account's lists on the map itself: a button beside the one that finds the reader, under it
  // on a wide screen and over it on a phone, unfolds the row of chips beside it, and folds it again. A chip shows a list alone on the map, and
  // the first one shows everything again. Not while a spot is being added: the map then takes
  // a marker, and shows everything.
  const listCount = (lists.data?.length ?? 0) + joined.length;
  const listsButton = onShowList && !isAdding && listCount > 0 && (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        className={cn(
          floating,
          // Filled while the map shows one list alone, as the chip of that list is.
          listView &&
            "bg-neutral-10 text-neutral-1 [--edge-color:transparent] hover:bg-neutral-10 aria-expanded:bg-neutral-10",
        )}
        aria-label={listView ? m.lists_showing({ name: listName(listView) }) : m.lists_filter()}
        aria-expanded={listsOpen}
        aria-controls={listsId}
        onClick={() => {
          setListsOpen(!listsOpen);
          // A phone has room for one of the two: the lists unfold over the legend, where it opens.
          if (!listsOpen && !wide) setLegendChoice(false);
        }}
      >
        <ListsIcon data-slot="icon" aria-hidden />
      </Button>
      <div
        id={listsId}
        // Folded, the row is out of sight and out of reach.
        inert={!listsOpen}
        className={cn(
          // Beside the button, as wide as the map leaves it: a row that is longer scrolls.
          "absolute top-1/2 right-full mr-xs w-max -translate-y-1/2",
          "max-w-[calc(100vw-var(--spacing-s)*2-3.375rem-var(--spacing-xs))] lg:max-w-md",
          // It unfolds from the button. The room around it is for the focus ring of a chip.
          "transition-[clip-path,opacity] duration-(--motion-large-duration) ease-theme-large motion-reduce:transition-none",
          listsOpen
            ? "opacity-100 [clip-path:inset(-0.5rem)]"
            : "opacity-0 [clip-path:inset(-0.5rem_-0.5rem_-0.5rem_100%)]",
        )}
      >
        <ListChips
          onMap
          className="max-w-full"
          lists={lists.data ?? []}
          joined={joined}
          current={listView?.id}
          onPick={onShowList}
        />
      </div>
    </div>
  );
  // Whoever reads a list by its link has no other: the map names it, and a press opens it.
  const listButton = listView && !onShowList && opened !== "saved" && (
    <Button
      variant="outline"
      size="sm"
      className={cn(floating, said, "max-w-[70vw] min-w-0")}
      onClick={() => onPanelChange("saved")}
    >
      <ListsIcon data-slot="icon" aria-hidden />
      <span className="truncate">{listName(listView)}</span>
    </Button>
  );
  // On a phone it stands where the lists unfold, and leaves them the room.
  const status = (waveStations.isPending || waveStations.isError) &&
    !listView &&
    (wide || !listsOpen) && (
      <p
        role="status"
        className={cn(
          "edge flex items-center gap-xs rounded-full bg-neutral-1 px-s py-xxs text-s whitespace-nowrap [--edge-color:var(--neutral-10-transparent)]",
          said,
        )}
      >
        {waveStations.isPending && <Spinner className="size-3.5" />}
        {waveStations.isPending ? m.map_loading() : m.map_load_failed()}
      </p>
    );
  // Not while a spot is being added: its panel has the search that puts the marker.
  const searchButton = !isAdding && (
    <Button
      ref={searchButtonRef}
      variant="outline"
      size="icon"
      className={floating}
      aria-label={m.search_open()}
      onClick={openSearch}
    >
      <SearchIcon data-slot="icon" aria-hidden />
    </Button>
  );
  const locateButton = (
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
  );
  const zoomButtons = (
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
  );
  const legend = (
    <MapLegend
      className={wide ? "absolute bottom-s left-s" : undefined}
      opens="up"
      // A phone keeps the title where the thumb pressed it, and has no button for the map's
      // credits: the legend opens them.
      titleUnder={!wide}
      onShowCredits={wide ? undefined : () => map.current?.showCredits()}
      layers={layers}
      onLayersChange={onLayersChange}
      expanded={legendChoice ?? wide}
      onExpandedChange={(expanded) => {
        setLegendChoice(expanded);
        if (expanded && !wide) setListsOpen(false);
      }}
      windTruncated={windTruncated}
      breaksTruncated={breaksTruncated}
    />
  );

  return (
    <div
      className="relative min-h-0 overflow-hidden"
      // What takes the bottom of a phone's map, which its buttons and its legend stand over: the
      // bar of tabs, the timeline above it, or the sheet that is open beside the map.
      style={
        !wide
          ? ({
              "--map-floor": `max(${
                timelineHeight > 0
                  ? `calc(${timelineHeight}px + var(--spacing-s) + var(--bottom-nav-lift, 0px))`
                  : "var(--bottom-nav-lift, 0px)"
              }, ${padding.bottom}px)`,
            } as CSSProperties)
          : undefined
      }
    >
      {/* The map and what floats on it. A tab's screen covers them on a phone: they are then
          out of reach of the keyboard and of a screen reader too. */}
      <div className="absolute inset-0" inert={isScreen}>
        <StationMap
          ref={map}
          stations={mapStations}
          windStations={mapWindStations}
          breaks={layers.breaks ? mapBreaks : []}
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
          onSelect={(id) => {
            setPressed(id && `station:${id}`);
            onSelect(id);
          }}
          onSelectBreak={(id) => {
            setPressed(`break:${id}`);
            onSelectBreak(id);
          }}
          onSelectSpot={(id) => {
            setPressed(`spot:${id}`);
            onSelectSpot(id);
          }}
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

        {wide ? (
          <>
            {listButton}
            {status}
            {legend}
          </>
        ) : (
          // On a phone they stand one over the other at the bottom of the map, the legend last,
          // where the map's skeleton draws it. They leave the map's buttons their column, and
          // the map is moved through the room they leave.
          <div
            inert={isCovered}
            className={cn(
              "pointer-events-none absolute left-s flex flex-col items-start justify-end gap-xs *:pointer-events-auto",
              "max-h-[calc(100%-var(--map-floor)-var(--spacing-s)*2)] max-w-[calc(100%-var(--spacing-s)*2-3.375rem-var(--spacing-xs))]",
              foot,
            )}
          >
            {listButton}
            {status}
            {legend}
          </div>
        )}

        {wide ? (
          <div
            // Under the header, and beside the station's panel when it is open, not under it.
            // The header has the search of a wide screen.
            className="absolute top-[calc(var(--spacing-s)+var(--app-header-lift,0px))] right-s grid gap-xs transition-[translate] duration-(--motion-large-duration) ease-theme-large"
            style={{ translate: `${-padding.right}px 0` }}
          >
            {/* A phone adds a spot from the "+" of its bar, with whatever else is added. */}
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
            {locateButton}
            {zoomButtons}
            {/* Last, so that no button moves when the account's lists are known. */}
            {listsButton}
          </div>
        ) : (
          // On a phone the column stands at the bottom of the map and grows up from the button
          // that finds the reader: no button moves when the account's lists are known. It stands
          // over the "+" of the bar, which is wider than its buttons, and in the middle of it.
          <div
            inert={isCovered}
            className={cn("absolute right-[calc(var(--spacing-s)+0.375rem)] grid gap-xs", foot)}
          >
            {zoomButtons}
            {listsButton}
            {searchButton}
            {locateButton}
          </div>
        )}

        {/* The sea's timeline runs along the bottom of the map: beside the legend on a wide screen,
          across a phone. A drawer opens over it, and it does not move. On a wide screen it leaves
          the corner to the button of the map's credits. */}
        {SEA_TIMELINE_SHOWN && layers.sea && seaTime && seaTimes && (
          <SeaTimeline
            ref={timelineRef}
            className={cn(
              "absolute",
              wide
                ? "right-[calc(var(--spacing-s)+2.5rem)] bottom-s left-[calc(var(--spacing-s)*2+16rem)] max-w-160"
                : "inset-x-s bottom-[calc(var(--spacing-s)+var(--bottom-nav-lift,0px))]",
            )}
            time={seaTime}
            times={seaTimes}
            onTimeChange={onSeaTimeChange}
          />
        )}
      </div>

      <ViewerDrawer
        open={selection !== undefined}
        identity={identity}
        onOpenChange={(open) => {
          if (!open) onSelect(undefined);
        }}
        wide={wide}
        alongside
        opensRaised={identity !== pressed}
        onSheetChange={setSelectionSheet}
        widened={widened}
        onWidenedChange={setWidened}
        onRest={rest.onRest}
        // An alert that is written and not saved keeps its panel open until it is answered for.
        mayDismiss={mayDismissSelection}
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
                  wide={wide}
                  onToggleFavorite={toggleFavorite}
                  onToggleList={(list, add) => onSave(list.id, shownItem, add)}
                  onCreateList={(name) => onCreateList(name, shownItem)}
                  onManageLists={() => onPanelChange("saved")}
                />
              )}
              {/* A phone does these in one menu, a spot's own when it is the account's. */}
              {wide ? (
                <>
                  {alertHere && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={m.alert_create()}
                      onClick={alertHere}
                    >
                      <BellIcon data-slot="icon" aria-hidden />
                    </Button>
                  )}
                  {sharedPlace && shownTitle && (
                    <SharePlace place={sharedPlace} name={shownTitle} />
                  )}
                  {shownPlace && <DirectionsActions place={shownPlace} />}
                </>
              ) : (
                !ownSpot &&
                shownTitle && (
                  <PlaceMenu
                    name={shownTitle}
                    onAlert={alertHere}
                    share={sharedPlace || undefined}
                    directions={shownPlace}
                  />
                )
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
                >
                  {!wide && (
                    <>
                      <MenuItem onClick={() => createAlert(ownSpot.id)}>
                        {m.alert_create()}
                      </MenuItem>
                      <DirectionsItems place={ownSpot} />
                    </>
                  )}
                </SpotActions>
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
        widened={widened}
        onWidenedChange={setWidened}
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
        onSheetChange={setAddingSheet}
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

      <ViewerTab
        open={opened === "saved"}
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
            recents={recents}
            onClearRecents={onClearRecents}
          />
        )}
      </ViewerTab>

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

      <ViewerTab
        open={opened === "alerts"}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        title={m.alerts_title()}
        actions={
          // How to be told is a setting of the account: its panel opens on it.
          signedIn && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.command_alerts_settings()}
              onClick={() => onSettingsPartChange("alerts")}
            >
              <SettingsIcon data-slot="icon" aria-hidden />
            </Button>
          )
        }
      >
        <AlertsPanel
          now={now}
          signedIn={signedIn}
          tab={alertsTab}
          onTabChange={onAlertsTabChange}
          notifications={notifications}
          alerts={alerting.alerts}
          spots={spotList}
          {...accountPrompt}
          onRead={onReadNotification}
          onOpenAlert={(alert) => {
            // At the spot that is open when the alert is set on it, where it may be being
            // written already, and otherwise at the first of its spots.
            const first =
              selectedSpotId !== undefined && alert.spotIds.includes(selectedSpotId)
                ? selectedSpotId
                : alert.spotIds[0];
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
        />
      </ViewerTab>

      <ViewerTab
        open={opened === "account"}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        title={
          alertSettings
            ? m.command_alerts_settings()
            : ownContributions
              ? m.contributions_title()
              : ownFriends
                ? m.friends_title()
                : ownSessions
                  ? m.sessions_title()
                  : m.account_menu()
        }
        onBack={
          alertSettings || ownContributions || ownFriends || ownSessions
            ? () => onSettingsPartChange(undefined)
            : undefined
        }
      >
        {alertSettings ? (
          <AlertSettingsForm
            settings={alerting.settings}
            deviceZone={alerting.deviceZone}
            onChange={alerting.onSettingsChange}
            push={push}
            now={now}
          />
        ) : ownContributions ? (
          <ContributionsPanel standing={account.standing} onOpenBreak={onOpenGuide} />
        ) : ownFriends ? (
          <FriendsPanel
            username={account.user?.username}
            onUsernameSave={account.onUsernameSave}
            friending={friending}
            onOpenBreak={onOpenGuide}
          />
        ) : ownSessions ? (
          <LogbookPanel
            now={now}
            log={sessioning.log}
            recap={sessioning.recap}
            onAdd={() => beginSession()}
            onOpen={openSession}
            onOpenPlace={openPlace}
          />
        ) : (
          <AccountPanel
            account={account.user}
            check={account.check}
            onUsernameSave={account.onUsernameSave}
            {...accountPrompt}
            onSignOut={account.onSignOut}
            onOpenAlertSettings={() => onSettingsPartChange("alerts")}
            standing={account.standing.data}
            onOpenContributions={() => onSettingsPartChange("contributions")}
            friendCount={account.friendCount}
            agents={account.agents}
            onOpenFriends={() => onSettingsPartChange("friends")}
            onOpenSessions={() => onSettingsPartChange("sessions")}
          />
        )}
      </ViewerTab>

      <ViewerDrawer
        open={isSearching}
        onOpenChange={(open) => {
          if (!open) search.onOpenChange(false);
        }}
        wide={wide}
        title={m.search_title()}
        // As tall as a sheet goes whatever was found, with the field in place over what scrolls.
        fill
        initialFocus={searchInput}
        finalFocus={searchButtonRef}
        // Safari may still scroll the page as its keyboard comes up for that field: once the sheet
        // is at rest, the page is put back where it stands.
        onRest={(open) => {
          if (open && window.scrollY !== 0) window.scrollTo(0, 0);
        }}
      >
        <PlaceSearch
          search={search}
          onPick={pickFound}
          label={m.search_title()}
          placeholder={m.search_placeholder()}
          inputRef={searchInput}
          headClassName={SEARCH_HEAD}
          bodyClassName={SEARCH_BODY}
        >
          {/* Before a key is pressed: what was looked at last, a press away. */}
          <RecentPlaces
            recents={recents}
            onSelect={(id) => {
              search.onOpenChange(false);
              onSelect(id);
            }}
            onSelectBreak={(id) => {
              search.onOpenChange(false);
              onSelectBreak(id);
            }}
            onSelectSpot={(id) => {
              search.onOpenChange(false);
              onSelectSpot(id);
            }}
            onClear={onClearRecents}
          />
          {recents.length === 0 && <p className="text-s text-neutral-7">{m.search_hint()}</p>}
        </PlaceSearch>
      </ViewerDrawer>

      <CreateSheet
        open={isCreating}
        onClose={closeCreateMenu}
        wide={wide}
        onAddSpot={createSpot}
        onAddAlert={() => createAlert()}
        onAddSession={createSession}
      />
      <AlertPlaceSheet
        open={alertSearch.isOpen}
        onClose={() => alertSearch.onOpenChange(false)}
        wide={wide}
        search={alertSearch}
        inputRef={alertInput}
        spots={spots.data}
        recents={recents}
        onSpot={(spotId) => createAlert(spotId)}
        onBreak={alertAtBreak}
        onAddSpot={() => {
          alertSearch.onOpenChange(false);
          addSpot();
        }}
      />
      <SessionSheet
        wide={wide}
        now={now}
        signedIn={signedIn}
        sessioning={sessioning}
        search={sessionSearch}
        spots={signedIn ? spots.data : undefined}
        recents={recents}
        {...accountPrompt}
        onOpenPlace={openPlace}
      />
      {/* Whose link the address names, and what it makes: over whatever the map shows. */}
      <InviteDialog
        invitation={invitation}
        signedIn={signedIn}
        username={account.user?.username}
        onUsernameSave={account.onUsernameSave}
      />
      <LeaveDialog />
    </div>
  );
}
