import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { LocateIcon, MinusIcon, PlusIcon } from "@repo/ui/icon";
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
  compassPoint,
  formatAgo,
  formatKnots,
  formatMeters,
  formatSeconds,
  freshnessOf,
  toKnots,
} from "@/lib/format";
import { m } from "@/paraglide/messages.js";

import { AlertsPanel } from "./alerts-panel";
import { BreakPanel } from "./break-panel";
import { ChartsAtRest } from "./chart-turns";
import { MapLegend } from "./map-legend";
import { SavedPanel } from "./saved-panel";
import { SeaTimeline, type SeaTimes } from "./sea-timeline";
import { ReadingAge, StationActions, holds } from "./station-actions";
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
  type Loadable,
  type SavedBreak,
  type SavedItem,
  type SavedList,
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
// How long a drawer may take to open before its charts stop waiting for it.
const DRAWER_REST_MS = 600;
// A wind reading older than this says little of the wind now.
const FRESH_WIND_MS = 2 * HOUR_MS;

export type ViewerPanel = "saved" | "alerts";

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
  // A station or a break is selected, never both.
  selectedId: string | undefined;
  selectedBreakId: string | undefined;
  selected: {
    station: Station | undefined;
    history: Loadable<StationReadings>;
    found: Loadable<SurfBreak>;
    // The forecast and the tide at the selected station or break.
    forecast: Loadable<Forecast>;
    tides: Loadable<TideTimeline>;
    extremes: Loadable<TideExtremes>;
  };
  // Asks for one more day of tide, before the days loaded or after them.
  onTideExtend: (direction: -1 | 1) => void;
  panel: ViewerPanel | undefined;
  signedIn: boolean;
  lists: Loadable<SavedList[]>;
  // The stations and the surf breaks the lists name, by id.
  savedStations: Map<string, Station>;
  savedBreaks: Map<string, SavedBreak>;
  notifications: Loadable<AlertNotification[]>;
  onLayersChange: (layers: MapLayers) => void;
  onSelect: (stationId: string | undefined) => void;
  onSelectBreak: (breakId: string) => void;
  onPanelChange: (panel: ViewerPanel | undefined) => void;
  onBoundsChange: (bounds: Bounds) => void;
  // `listId` is a list's id, or "favorites".
  onSave: (listId: string, item: SavedItem, add: boolean) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (list: SavedList) => void;
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
      height !== null && formatMeters(height),
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
        m.map_wind_speed({ speed: formatKnots(speed) }),
        direction !== null && m.map_from({ direction: compassPoint(direction) }),
      ]
        .filter(Boolean)
        .join(", "),
    },
  ];
}

type Selection = ViewerProps["selected"] & { id: string | undefined; breakId: string | undefined };

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
    one.station === other.station &&
    sameLoadable(one.history, other.history) &&
    sameLoadable(one.found, other.found) &&
    sameLoadable(one.forecast, other.forecast) &&
    sameLoadable(one.tides, other.tides) &&
    sameLoadable(one.extremes, other.extremes)
  );
}

/** The map of the buoys, the wind stations and the sea, with the panels that open from it. */
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
  selectedId,
  selectedBreakId,
  selected,
  onTideExtend,
  panel,
  signedIn,
  lists,
  savedStations,
  savedBreaks,
  notifications,
  onLayersChange,
  onSelect,
  onSelectBreak,
  onPanelChange,
  onBoundsChange,
  onSave,
  onCreateList,
  onDeleteList,
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

  // The charts of a station's panel load apart from the map. Asking for them now means they are
  // there by the time a station is opened.
  useEffect(() => {
    void import("./sea-chart");
    void import("./tide-chart");
  }, []);

  const savedIds = useMemo(
    () => new Set((lists.data ?? []).flatMap((list) => list.stationIds)),
    [lists.data],
  );
  const mapStations = useMemo(
    () => (waveStations.data ?? []).map((station) => describeStation(station, now, savedIds)),
    [waveStations.data, now, savedIds],
  );
  const mapWindStations = useMemo(
    () => (layers.wind ? windStations.flatMap((station) => describeWindStation(station, now)) : []),
    [layers.wind, windStations, now],
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

  // The id of what is selected: a station or a break.
  const selection = selectedId ?? selectedBreakId;

  // The selected break as the map draws it. The breaks in view hold it, unless it was opened by
  // its address: its place is then known once its panel has loaded.
  const loadedBreak = selected.found.data;
  const selectedBreak = useMemo<MapBreak | undefined>(() => {
    if (!selectedBreakId) return undefined;
    const inView = breaks.find((found) => found.id === selectedBreakId);
    if (inView) return inView;
    return loadedBreak?.id === selectedBreakId ? loadedBreak : undefined;
  }, [breaks, selectedBreakId, loadedBreak]);

  // What a drawer covers of the map, so that a station is shown beside it and not under it.
  const padding = useMemo(() => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!selection || typeof window === "undefined") return none;
    return wide
      ? { ...none, right: SIDE_PANEL_WIDTH }
      : { ...none, bottom: Math.round(window.innerHeight * SHEET_SNAP_POINTS[0]!) };
  }, [selection, wide]);

  // The panel of a station or of a break keeps its content while it slides away.
  const ids = { id: selectedId, breakId: selectedBreakId };
  const lastSelection = useRef({ ...ids, ...selected });
  if (selection && !sameSelection(lastSelection.current, { ...ids, ...selected })) {
    lastSelection.current = { ...ids, ...selected };
  }
  const shown = lastSelection.current;
  // The charts of a panel take long to draw, and each answer of the API draws them again. Drawn
  // at once, they stop the drawer and the map while these move. The panel's content is drawn
  // behind, a little at a time, and the drawer does not wait for it.
  const drawn = useDeferredValue(shown);
  // Until the content of a new selection is drawn, the panel is empty: not the one before.
  const isDrawn = drawn.id === shown.id && drawn.breakId === shown.breakId;
  // The charts wait for the drawer to come to rest. The drawer says when, and a drawer that opens
  // with the page says nothing: the wait then ends by itself.
  const [atRest, setAtRest] = useState(false);
  const isOpen = selection !== undefined;
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => setAtRest(true), DRAWER_REST_MS);
    return () => {
      clearTimeout(timer);
      setAtRest(false);
    };
  }, [isOpen]);
  const shownBreak = shown.breakId ? shown.found : undefined;
  const shownReading = shown.history.data?.readings[0] ?? shown.station?.latestReading;
  const shownName = shown.history.data?.station.name ?? shown.station?.name;
  const shownTitle = shownBreak
    ? (shownBreak.data?.name ?? (shownBreak.isError ? m.break_title() : undefined))
    : shownName;

  function requireAccount(reason: string, then?: () => void) {
    promptAuth({ reason, onSignedIn: then });
  }

  // What the star and the menu of the panel save: the station, or the break when it is known.
  const shownItem: SavedItem | undefined = shown.breakId
    ? shown.found.data && { breakId: shown.breakId }
    : shown.id
      ? { stationId: shown.id }
      : undefined;

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
        selectedId={selection}
        selectedBreak={selectedBreak}
        layers={layers}
        seaLayer={sea}
        seaTime={seaTime}
        theme={theme}
        padding={padding}
        userLocation={userLocation}
        userLocationLabel={m.locate_you_are_here()}
        onSelect={onSelect}
        onSelectBreak={onSelectBreak}
        onBoundsChange={onBoundsChange}
      />

      {(waveStations.isPending || waveStations.isError) && (
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
        onOpenChange={(open) => {
          if (!open) onSelect(undefined);
        }}
        wide={wide}
        alongside
        onRest={(open) => {
          if (open) setAtRest(true);
        }}
        title={shownTitle ?? <Skeleton className="h-(--line-l) w-48 rounded-(--radius-xs)" />}
        description={
          shown.breakId ? (
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
          shownItem && (
            <StationActions
              item={shownItem}
              lists={signedIn ? (lists.data ?? []) : undefined}
              onToggleFavorite={toggleFavorite}
              onToggleList={(list, add) => onSave(list.id, shownItem, add)}
              onManageLists={() => onPanelChange("saved")}
            />
          )
        }
      >
        <ChartsAtRest value={atRest}>
          {!isDrawn ? null : drawn.breakId ? (
            <BreakPanel
              key={drawn.breakId}
              now={now}
              found={drawn.found}
              forecast={drawn.forecast}
              tides={drawn.tides}
              extremes={drawn.extremes}
              onTideExtend={onTideExtend}
            />
          ) : (
            <StationPanel
              // A new station starts at the top, with its own charts.
              key={drawn.id}
              now={now}
              station={drawn.station}
              history={drawn.history}
              forecast={drawn.forecast}
              tides={drawn.tides}
              extremes={drawn.extremes}
              onTideExtend={onTideExtend}
            />
          )}
        </ChartsAtRest>
      </ViewerDrawer>

      <ViewerDrawer
        open={panel === "saved"}
        onOpenChange={(open) => {
          if (!open) onPanelChange(undefined);
        }}
        wide={wide}
        title={m.saved_title()}
      >
        <SavedPanel
          now={now}
          signedIn={signedIn}
          lists={lists}
          stations={savedStations}
          breaks={savedBreaks}
          onSelect={onSelect}
          {...accountPrompt}
          onSelectBreak={onSelectBreak}
          onRemove={(list, item) => onSave(list.id, item, false)}
          onCreateList={onCreateList}
          onDeleteList={onDeleteList}
        />
      </ViewerDrawer>

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
          notifications={notifications}
          {...accountPrompt}
          onRead={onReadNotification}
        />
      </ViewerDrawer>
    </div>
  );
}
