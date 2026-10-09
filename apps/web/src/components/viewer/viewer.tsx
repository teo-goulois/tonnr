import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { LocateIcon, MinusIcon, PlusIcon } from "@repo/ui/icon";
import { cn } from "@repo/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MapLegend } from "./map-legend";
import { SavedPanel } from "./saved-panel";
import { ReadingAge, StationActions } from "./station-actions";
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
  panel: ViewerPanel | undefined;
  signedIn: boolean;
  lists: Loadable<SavedList[]>;
  // The stations the lists name, by id.
  savedStations: Map<string, Station>;
  notifications: Loadable<AlertNotification[]>;
  onLayersChange: (layers: MapLayers) => void;
  onSelect: (stationId: string | undefined) => void;
  onSelectBreak: (breakId: string) => void;
  onPanelChange: (panel: ViewerPanel | undefined) => void;
  onBoundsChange: (bounds: Bounds) => void;
  // `listId` is a list's id, or "favorites".
  onSave: (listId: string, stationId: string, add: boolean) => void;
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
  panel,
  signedIn,
  lists,
  savedStations,
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

  // The model's latest field that is not in the future, then as many steps ahead as asked.
  const seaStepMs = (sea?.times.stepSeconds ?? 0) * 1000;
  const seaTimestamp = useMemo(() => {
    if (!sea || seaStepMs <= 0) return undefined;
    const start = sea.times.start.getTime();
    const present = start + Math.floor((now - start) / seaStepMs) * seaStepMs;
    const time = present + seaSteps * seaStepMs;
    return Math.min(Math.max(time, start), sea.times.end.getTime());
  }, [sea, seaStepMs, seaSteps, now]);
  const seaTime = useMemo(
    () => (seaTimestamp === undefined ? undefined : new Date(seaTimestamp)),
    [seaTimestamp],
  );

  // What a drawer covers of the map, so that a station is shown beside it and not under it.
  const padding = useMemo(() => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!(selectedId ?? selectedBreakId) || typeof window === "undefined") return none;
    return wide
      ? { ...none, right: SIDE_PANEL_WIDTH }
      : { ...none, bottom: Math.round(window.innerHeight * SHEET_SNAP_POINTS[0]!) };
  }, [selectedId, selectedBreakId, wide]);

  // The panel of a station or of a break keeps its content while it slides away.
  const lastSelection = useRef({ id: selectedId, breakId: selectedBreakId, ...selected });
  if (selectedId ?? selectedBreakId) {
    lastSelection.current = { id: selectedId, breakId: selectedBreakId, ...selected };
  }
  const shown = lastSelection.current;
  const shownReading = shown.history.data?.readings[0] ?? shown.station?.latestReading;
  const shownName = shown.history.data?.station.name ?? shown.station?.name;
  const shownTitle = shown.breakId
    ? (shown.found.data?.name ?? (shown.found.isError ? m.break_title() : undefined))
    : shownName;

  function requireAccount(reason: string, then?: () => void) {
    promptAuth({ reason, onSignedIn: then });
  }

  function toggleFavorite() {
    if (!shown.id) return;
    const stationId = shown.id;
    if (!signedIn) {
      requireAccount(m.auth_reason_save({ name: shownName ?? m.auth_reason_this_station() }), () =>
        onSave("favorites", stationId, true),
      );
      return;
    }
    const isFavorite = (lists.data ?? []).some(
      (list) => list.isDefault && list.stationIds.includes(stationId),
    );
    onSave("favorites", stationId, !isFavorite);
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
    <div className="relative min-h-0 overflow-hidden">
      <StationMap
        ref={map}
        stations={mapStations}
        windStations={mapWindStations}
        breaks={layers.breaks ? breaks : []}
        selectedId={selectedId ?? selectedBreakId}
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
        layers={layers}
        onLayersChange={onLayersChange}
        expanded={legendChoice ?? wide}
        onExpandedChange={setLegendChoice}
        seaTime={layers.sea ? seaTime : undefined}
        seaIsNow={seaSteps === 0}
        canStepBack={
          sea !== undefined &&
          seaTimestamp !== undefined &&
          seaTimestamp - seaStepMs >= sea.times.start.getTime()
        }
        canStepForward={
          sea !== undefined &&
          seaTimestamp !== undefined &&
          seaTimestamp + seaStepMs <= sea.times.end.getTime()
        }
        onSeaStep={(steps) => setSeaSteps((current) => current + steps)}
        onSeaNow={() => setSeaSteps(0)}
        windTruncated={windTruncated}
        breaksTruncated={breaksTruncated}
      />

      <ViewerDrawer
        open={(selectedId ?? selectedBreakId) !== undefined}
        onOpenChange={(open) => {
          if (!open) onSelect(undefined);
        }}
        wide={wide}
        alongside
        title={shownTitle ?? <Skeleton className="h-(--line-l) w-48 rounded-(--radius-xs)" />}
        description={
          shown.breakId ? (
            shown.found.data ? (
              <a
                className="underline underline-offset-2 hover:text-neutral-10"
                href={shown.found.data.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {m.break_from_catalogue()}
              </a>
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
          shown.id && (
            <StationActions
              stationId={shown.id}
              lists={signedIn ? (lists.data ?? []) : undefined}
              onToggleFavorite={toggleFavorite}
              onToggleList={(list, add) => shown.id && onSave(list.id, shown.id, add)}
              onManageLists={() => onPanelChange("saved")}
            />
          )
        }
      >
        {shown.breakId ? (
          <BreakPanel
            key={shown.breakId}
            now={now}
            found={shown.found}
            forecast={shown.forecast}
            tides={shown.tides}
            extremes={shown.extremes}
          />
        ) : (
          <StationPanel
            // A new station starts at the top, with its own charts.
            key={shown.id}
            now={now}
            station={shown.station}
            history={shown.history}
            forecast={shown.forecast}
            tides={shown.tides}
            extremes={shown.extremes}
          />
        )}
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
          {...accountPrompt}
          onSelect={onSelect}
          onRemove={(list, stationId) => onSave(list.id, stationId, false)}
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
