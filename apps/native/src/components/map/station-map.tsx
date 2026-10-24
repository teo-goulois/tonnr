import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapLibre,
  type MapRef,
  Marker,
  type PressEvent,
  RasterSource,
  ViewAnnotation,
} from "@maplibre/maplibre-react-native";
import { LAND_TILE_SIZE } from "@repo/client/map/land";
import {
  opensLeft,
  type PlacedMarker,
  placeMarkers,
  rankStations,
  SELECTED_SCALE,
  sameMarkers,
  WIND_LIFT,
} from "@repo/client/map/markers";
import { SEA_ARROW, SEA_MAX_ZOOM } from "@repo/client/map/sea";
import {
  FINGER_REACH,
  fitPadding,
  fitted,
  isInView,
  MAX_ZOOM,
  middleOfBounds,
  type Padding,
  projector,
} from "@repo/client/map/view";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, NO_READING_COLOR } from "@repo/client/sea-scales";
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type NativeSyntheticEvent,
  Platform,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import {
  BOLD_FONT,
  BREAK_NAME_ZOOM,
  BREAK_WAVE_ZOOM,
  BUOY_RADIUS,
  BUOY_RING,
  byBreakDisc,
  DISC_ICON,
  type Expression,
  IMAGES,
  type MapPlace,
  type MapStation,
  type MapWind,
  NAME_SIZE,
  NAME_WIDTH,
  type PlaceKind,
  placeFeatures,
  pressed,
  RECENT_RADIUS,
  scaleExpression,
  SHELTERED_RADIUS,
  SPOT_NAME_ZOOM,
  SPOT_RADIUS,
  stationFeatures,
  WIND_RADIUS,
  windFeatures,
} from "./features";
import type { MapLayers } from "./layers";
import { mapImages } from "./map-images";
import { BREAK_PILL_POINT, BreakPill, BuoyPill, UserDot, WindBadge } from "./map-markers";
import { useBasemap, useBasemapTiles } from "./use-basemap";
import { type MapState, rememberMapState } from "./map-state";
import { landTiles, onTileFailed, seaTiles } from "./drawn-tiles";
import { drawTiles, seaPalette } from "./tile-painter";
import { arrowFeatures, type SeaArrow } from "./sea-arrows";
import { askAgainIn, drawnWhole, momentOf, seaKey, showing, type SeaSources } from "./sea-sources";
import { SPOT_PIN_FOOT, SpotPin } from "./spot-pin";
import {
  boundsAround,
  type Bounds,
  type LngLat,
  type MapPoint,
  type MapView,
  readView,
  STYLE_URLS,
  VIEW_KEY,
  wrapLongitude,
  writeView,
} from "./view";

// The map, the web's `StationMap` drawn by MapLibre Native: OpenFreeMap's basemap in the theme in
// force, the sea colored by its height under its names (decision 018), and over them the stations,
// the surf breaks and the account's own spots, each a source of GeoJSON that the map draws and
// places itself, with the colors of the sea's scales. The buoys and the wind stations that have
// room carry the web's pills and badges, as markers of the platform's whose place is chosen here
// as the web chooses it, and the break or the spot in hand its pill. North stays up, so that an
// arrow drawn on it points the right way. A press opens what is nearest the finger; a press held
// puts a new spot.
// The sheet that adds a spot draws it too, with the breaks and the spots alone, and the map then
// keeps nothing of where it rests: what the phone keeps and the other screens read is the tab's.

/** The sea as the API describes its tiles. */
export type SeaMap = {
  tileUrlTemplate: string;
  minZoom: number;
  maxZoom: number;
  encoding: { metersByLevel: readonly number[] };
  source: { attribution: string };
};

/** What a press opened, and where the finger was. */
export type MapPress = { kind: PlaceKind; id: string; at: LngLat; point: [number, number] };

export type StationMapHandle = {
  /**
   * Brings a point to the middle of what the map shows, clear of what covers it, no further out
   * than `zoom`.
   */
  focus: (point: MapPoint, zoom?: number) => void;
  /**
   * Shows these points together, no closer than a bay, inside what the screen's bars cover at
   * the top and at the bottom.
   */
  fit: (points: readonly MapPoint[], covered?: Partial<Padding>) => void;
};

type StationMapProps = {
  ref?: Ref<StationMapHandle>;
  stations: readonly MapStation[];
  wind: readonly MapWind[];
  breaks: readonly MapPlace[];
  // The account's own spots, which no switch hides.
  spots: readonly MapPlace[];
  // What a sheet is open on.
  selected: { kind: PlaceKind; id: string } | undefined;
  // What covers the map at each edge, the status bar and a sheet that is open, in points: a place
  // selected is shown clear of it, and what the map is sent to is brought to its middle. Unknown
  // while the sheet of what is selected has not said how tall it stands, and the place waits.
  padding?: Padding | undefined;
  // The place a sheet is open on, wherever it is: a break or a spot, which its pill stands for,
  // one of those drawn or one that is not, opened by its address or with the breaks switched off,
  // and a station, which is brought into view when it is not on the map, as a wind station that
  // a link names far from the view, whose markers are loaded only for the view.
  selectedPlace?: MapPlace | undefined;
  layers: MapLayers;
  sea: SeaMap | undefined;
  seaTime: Date | undefined;
  arrows: readonly SeaArrow[];
  // Where the reader was found, once they asked.
  userLocation: MapPoint | null;
  // The spot being added, whose marker stands there and is dragged elsewhere. A screen reader
  // reads it and moves it through the map's own label, value and actions.
  draft?: MapPoint | null;
  onDraftMoved?: (point: MapPoint) => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  // What a screen reader may do with the map besides reading it, and what that does.
  accessibilityValue?: { text: string };
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  // The view it opens on, in place of the one the phone kept.
  opening?: MapView;
  // Whether where it rests is the map's own, which the phone keeps and the other screens read:
  // the map tab's. A map of a sheet keeps nothing.
  remembers?: boolean;
  onPress: (press: MapPress) => void;
  // A press that met no marker.
  onMapPress?: (at: LngLat) => void;
  onLongPress?: (at: LngLat) => void;
  // The map begins to move, and whether a finger moves it.
  onMoveStart?: (byHand: boolean) => void;
  // Where the map came to rest, and whether a finger moved it there.
  onMoved: (state: MapState, byHand: boolean) => void;
};

// The layers a press can land on, as on the web. A buoy or a wind station that has its marker is
// pressed there.
const DOT_LAYERS = ["spot-dots", "break-dots", "station-dots", "wind-dots"];
// How often the markers are chosen again while the map moves, in milliseconds: a pill comes in at
// the edge and a pill that would cover another leaves, a few times a second.
const LAYOUT_MS = 120;
// How long the map takes to go somewhere it was asked to, and to bring a place selected into view,
// as on the web.
const MOVE_MS = 600;
const REVEAL_MS = 500;
// No room kept at any edge: Android keeps the room a move was given for the moves after it.
const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
// How long one moment of the sea takes to fade into the next, as on the web.
const SEA_FADE_MS = 250;
// The opacity of a moment of the sea whose tiles come while another is in view. MapLibre Native
// loads no tile of a layer it does not draw, so it is drawn, too faint to be seen.
const SEA_COMING = 0.01;
// How long the coming moment of the sea is waited for, at most.
const SEA_WAIT_MS = 3000;

const get = (property: string) => ["get", property] as unknown as Expression;
const visible = (on: boolean) => (on ? "visible" : "none") as "visible" | "none";
const is = (id: string | undefined) =>
  ["==", ["get", "id"], id ?? ""] as unknown as Expression & never;

function storedView() {
  try {
    return readView(localStorage.getItem(VIEW_KEY));
  } catch {
    return readView(null);
  }
}

export function StationMap({
  ref,
  stations,
  wind,
  breaks,
  spots,
  selected,
  selectedPlace,
  padding,
  layers,
  sea,
  seaTime,
  arrows,
  userLocation,
  draft = null,
  onDraftMoved,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  accessibilityActions,
  onAccessibilityAction,
  opening: openingView,
  remembers = true,
  onPress,
  onMapPress,
  onLongPress,
  onMoveStart,
  onMoved,
}: StationMapProps) {
  const { scheme, colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  // The view the map opens on, read once.
  const [opening] = useState(() => openingView ?? storedView());
  const zoom = useRef(opening.zoom);
  // How large the map is drawn, which a list is fitted in, and where it stands: what the markers
  // are placed on, projected here, since the platform projects a point only by a call that waits.
  const size = useRef({ width: 0, height: 0 });
  const view = useRef<MapView>(opening);

  // The basemap's style, which the map waits for: its names are given the web's width. One that
  // could not be read is read by the map from its address as it is.
  const basemap = useBasemap(scheme);
  // Whether the map was drawn once. It then stays, as the web's does, and only its style changes
  // with the theme: drawn anew, it would open where it first opened and lose the reader's view.
  const [drawn, setDrawn] = useState(false);
  if (!basemap.isPending && !drawn) setDrawn(true);
  // A list fitted before the map was drawn, which is fitted once it is.
  const waitingFit = useRef<(() => void) | undefined>(undefined);
  // Whether the map has loaded, and can be moved.
  const [loaded, setLoaded] = useState(false);
  // Written once as JSON, which the map reads as a style, so that it is not written again each
  // time the map is drawn again.
  const mapStyle = useMemo(
    () => (basemap.data ? JSON.stringify(basemap.data.style) : STYLE_URLS[scheme]),
    [basemap.data, scheme],
  );
  const surface = colors["neutral-1"];
  const ink = colors["neutral-10"];
  const accent = colors["color-1"];
  const images = useMemo(() => mapImages(surface), [surface]);
  const duration = reduceMotion ? 0 : MOVE_MS;
  // What covers the map now, which a move is always given: Android keeps the room a move was
  // given for the moves after it.
  const covered = useRef(padding ?? NO_PADDING);
  covered.current = padding ?? NO_PADDING;

  useImperativeHandle(
    ref,
    () => ({
      focus: (point, at) =>
        camera.current?.easeTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(zoom.current, at ?? 0),
          padding: covered.current,
          duration,
        }),
      fit: (points, covered) => {
        const box = boundsAround(points);
        if (!box) return;
        const padding = fitPadding(covered);
        const move = () => {
          // The platform's fit takes no zoom to stop at: one that would come closer than a bay
          // is a move to the box's middle at that zoom instead.
          const fit = fitted(box, size.current, padding);
          if (fit.capped) {
            camera.current?.easeTo({ center: fit.center, zoom: fit.zoom, padding, duration });
          } else {
            camera.current?.fitBounds(box, { padding, duration, easing: "ease" });
          }
        };
        if (camera.current) move();
        else waitingFit.current = move;
      },
    }),
    [duration],
  );

  // Whether the map moved since a finger last touched it. On iOS, MapLibre's module presses the map
  // where the last touch began whenever a marker that was pressed is taken off the map, which the
  // markers are as the map moves: that press is no one's, and only a touch that moved nothing is.
  const movedSinceTouch = useRef(false);
  // Whether a buoy's pill or a wind's badge took the touch. The marker selects what it stands for,
  // which draws it again, and the press the module then gives the map is that same touch's: the
  // map counts a press only once a new touch began.
  const markerTookTouch = useRef(false);

  // One press selects one thing, as on the web: the dot nearest to the finger, within its reach,
  // whichever layer draws it. A press that finds none is the map's.
  const press = async (event: NativeSyntheticEvent<PressEvent>) => {
    const { lngLat, point } = event.nativeEvent;
    const [x, y] = point;
    const features =
      (await map.current
        ?.queryRenderedFeatures(
          [
            [x - FINGER_REACH, y - FINGER_REACH],
            [x + FINGER_REACH, y + FINGER_REACH],
          ],
          { layers: DOT_LAYERS },
        )
        // A map that is gone, or still loading its style, has drawn nothing to press.
        .catch(() => [])) ?? [];
    const found = pressed(features, lngLat);
    if (found) onPress({ ...found, point });
    else onMapPress?.(lngLat);
  };

  // The sea and the land over it are tiles the app draws (decision 077).
  useEffect(drawTiles, []);

  // The markers that have room, chosen as the web chooses them: the biggest seas first, the
  // selected buoy and the saved ones before, then the wind, none covering another.
  const selectedStation = selected?.kind === "station" ? selected.id : undefined;
  const ranked = useMemo(
    () => rankStations(stations, selectedStation),
    [stations, selectedStation],
  );
  const [placed, setPlaced] = useState<PlacedMarker[]>([]);
  // The pill of the break in hand opens to the right of its disc, and to the left when the right
  // has no room for it.
  const pinned = selected?.kind === "station" ? undefined : selectedPlace;
  const [pillLeft, setPillLeft] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);
  const laidOut = useRef(0);
  const layout = () => {
    const { width, height } = size.current;
    if (width === 0 || height === 0) return;
    laidOut.current = Date.now();
    const project = projector(view.current, size.current);
    const next = placeMarkers({
      buoys: layers.buoys ? ranked : null,
      wind: layers.wind ? wind : null,
      selectedId: selectedStation,
      project,
      size: size.current,
    });
    setPlaced((previous) => (sameMarkers(previous, next) ? previous : next));
    if (pinned) {
      const { x } = project(pinned.longitude, pinned.latitude);
      setPillLeft(opensLeft({ x, pillWidth: pillWidth * SELECTED_SCALE, mapWidth: width }));
    }
  };
  // Chosen again when what the map holds changes, and as it moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(layout, [ranked, wind, layers.buoys, layers.wind, pinned, pillWidth]);
  const stationsById = useMemo(() => new Map(stations.map((one) => [one.id, one])), [stations]);
  const windById = useMemo(() => new Map(wind.map((one) => [one.id, one])), [wind]);

  // The place selected comes into view when it is off the map, close to an edge or under the
  // sheet, as on the web: one that is already in view stays where it is, and the map does not
  // move under the finger that pressed it. It is brought to the middle of what is not covered, at
  // the zoom the map is at, once, when its point and the sheet's height are both known and the
  // map has loaded, which a link that starts the app may come before.
  const revealed = useRef<string | undefined>(undefined);
  const selectedKey = selected && `${selected.kind}:${selected.id}`;
  useEffect(() => {
    if (!selected) revealed.current = undefined;
    if (!loaded || !selected || !padding || revealed.current === selectedKey) return;
    const place =
      (selected.kind === "station"
        ? (stationsById.get(selected.id) ?? windById.get(selected.id))
        : undefined) ?? (selectedPlace?.id === selected.id ? selectedPlace : undefined);
    const { width, height } = size.current;
    if (!place || width === 0 || height === 0) return;
    revealed.current = selectedKey;
    const point = projector(view.current, size.current)(place.longitude, place.latitude);
    if (isInView(point, size.current, padding)) return;
    camera.current?.easeTo({
      center: [place.longitude, place.latitude],
      padding,
      duration: reduceMotion ? 0 : REVEAL_MS,
    });
    // The point and the room are read as they are when the place is selected or becomes known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedKey, selectedPlace, stationsById, windById, padding]);

  // The arrows on the sea where the map draws water, as the web keeps them: an island smaller than
  // a cell of the model is sea to it, and land on the map. They are read again where the map rests,
  // and written only when they change, since writing them draws the map again.
  const [onWater, setOnWater] = useState<readonly SeaArrow[]>([]);
  const written = useRef("");
  // A style that draws no water keeps every arrow, as the web's does: the map answers nothing for a
  // layer it does not have, which would drop them all. The style the instance names has it.
  const hasWater = basemap.data?.style.layers.some((layer) => layer.id === "water") ?? true;
  const keepOnWater = async () => {
    const instance = map.current;
    if (!instance) return;
    const { width, height } = size.current;
    const project = projector(view.current, size.current);
    const kept = await Promise.all(
      arrows.map(async (arrow) => {
        const { x, y } = project(arrow.longitude, arrow.latitude);
        if (x < 0 || y < 0 || x > width || y > height) return false;
        if (!hasWater) return true;
        const water = await instance
          .queryRenderedFeatures([x, y], { layers: ["water"] })
          // A map that is gone: the arrow stays.
          .catch(() => null);
        return water === null || water.length > 0;
      }),
    );
    const next = arrows.filter((_, index) => kept[index]);
    const signature = JSON.stringify(next);
    if (signature === written.current) return;
    written.current = signature;
    setOnWater(next);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void keepOnWater(), [arrows, hasWater]);

  const seaPaletteName = useMemo(
    () => (sea ? seaPalette(sea.encoding.metersByLevel) : undefined),
    [sea],
  );
  const basemapTiles = useBasemapTiles(scheme);
  const landColor = basemap.data?.land;
  const waterColor = basemap.data?.water;
  const land = useMemo(
    () =>
      basemapTiles && landColor && waterColor
        ? {
            tiles: landTiles(basemapTiles.tiles, { land: landColor, water: waterColor }),
            maxZoom: basemapTiles.maxZoom,
          }
        : undefined,
    [basemapTiles, landColor, waterColor],
  );
  // Each moment of the sea is a source of its own, and so is each time a moment is asked again:
  // a tile the app could not draw is never asked again by MapLibre, so the map asks the moment
  // again, after a while, as a new source, whose tiles that came MapLibre has already
  // (`sea-sources.ts`). The source in view stays under the next until the next is drawn whole,
  // and the next fades in over it, so that the sea never goes blank between the two. MapLibre says
  // once a style is loaded that the map is drawn, and then only frame by frame: the coming source
  // is shown at the first frame drawn whole after one that waited for tiles.
  const seaMoment = seaTime?.toISOString();
  const [askedAgain, setAskedAgain] = useState<{ moment?: string; tries: number }>({ tries: 0 });
  const seaTries = askedAgain.moment === seaMoment ? askedAgain.tries : 0;
  const seaInForce = seaMoment === undefined ? undefined : seaKey(seaMoment, seaTries);
  const [seaState, setSeaState] = useState<SeaSources>({ shown: seaInForce });
  const seaOn = Boolean(layers.sea && sea && seaTime && seaPaletteName && land);
  // The first source is shown at once, and a sea not drawn shows the source in force once it is.
  if (
    (!seaOn || seaState.shown === undefined) &&
    (seaState.shown !== seaInForce || seaState.under !== undefined)
  ) {
    setSeaState({ shown: seaInForce });
  }
  const { shown: seaShown, under: seaUnder } = seaState;
  const comingSea = seaOn && seaInForce !== seaShown ? seaInForce : undefined;
  const comesBack = comingSea !== undefined && comingSea === seaUnder;
  const seaSources = [...new Set([seaUnder, seaShown, comingSea])].filter(
    (key): key is string => key !== undefined,
  );
  // Whether a tile of the sea failed since the shown source was shown, and when it was.
  const seaFailed = useRef(false);
  const seaShownAt = useRef(0);
  const revealSea = useCallback((key: string) => {
    seaFailed.current = false;
    seaShownAt.current = Date.now();
    setSeaState((state) => showing(state, key));
  }, []);
  // The failures of the moment in force in a row, and the asking again they wait for.
  const seaFailures = useRef<{ moment?: string; count: number }>({ count: 0 });
  const askingAgain = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const momentInForce = useRef(seaMoment);
  momentInForce.current = seaMoment;
  useEffect(() => {
    const stop = onTileFailed((kind) => {
      if (kind !== "sea") return;
      seaFailed.current = true;
      const moment = momentInForce.current;
      if (askingAgain.current !== undefined || moment === undefined) return;
      const failures = seaFailures.current.moment === moment ? seaFailures.current.count + 1 : 1;
      seaFailures.current = { moment, count: failures };
      askingAgain.current = setTimeout(() => {
        askingAgain.current = undefined;
        setAskedAgain((asked) => ({
          moment,
          tries: (asked.moment === moment ? asked.tries : 0) + 1,
        }));
      }, askAgainIn(failures));
    });
    return () => {
      stop();
      clearTimeout(askingAgain.current);
      askingAgain.current = undefined;
    };
  }, []);
  // The source under the shown one goes once the shown one has faded in and is drawn whole, with
  // no tile failed since it was shown.
  const seaDrawnWhole = useRef(false);
  const settleSea = useCallback(() => {
    if (!seaDrawnWhole.current || seaFailed.current) return;
    if (Date.now() - seaShownAt.current < SEA_FADE_MS) return;
    seaFailures.current = { count: 0 };
    setSeaState((state) => drawnWhole(state));
  }, []);
  // The source whose tiles come, and whether a frame was drawn without all of them.
  const awaitedSea = useRef<{ key: string; loading: boolean } | undefined>(undefined);
  useEffect(() => {
    awaitedSea.current = undefined;
    if (comingSea === undefined) return;
    // The source under the shown one has its tiles.
    if (comesBack) {
      revealSea(comingSea);
      return;
    }
    awaitedSea.current = { key: comingSea, loading: false };
    // A source whose tiles do not come does not hold the sea back for ever: the one in view stays
    // under it.
    const timer = setTimeout(() => revealSea(comingSea), SEA_WAIT_MS);
    return () => clearTimeout(timer);
  }, [comingSea, comesBack, revealSea]);
  // Once the shown source has faded in, the one under it goes if the map is drawn whole by then.
  useEffect(() => {
    if (seaUnder === undefined) return;
    const timer = setTimeout(settleSea, SEA_FADE_MS);
    return () => clearTimeout(timer);
  }, [seaShown, seaUnder, settleSea]);
  const stationData = useMemo(() => stationFeatures(stations), [stations]);
  const windData = useMemo(() => windFeatures(wind), [wind]);
  const breakData = useMemo(() => placeFeatures(breaks, "break"), [breaks]);
  const spotData = useMemo(() => placeFeatures(spots, "spot"), [spots]);
  const arrowData = useMemo(() => arrowFeatures(onWater), [onWater]);
  const isRecent = ["boolean", ["get", "recent"], false] as unknown as Expression;
  const nameLayout = (radius: Expression | number) => ({
    "text-field": get("name"),
    "text-font": BOLD_FONT,
    "text-size": NAME_SIZE,
    "text-variable-anchor": ["top", "bottom", "left", "right"] as (
      | "top"
      | "bottom"
      | "left"
      | "right"
    )[],
    "text-radial-offset": radius,
    "text-justify": "center" as const,
    "text-max-width": NAME_WIDTH,
  });
  const namePaint = { "text-color": ink, "text-halo-color": surface, "text-halo-width": 1.5 };
  // The break or the spot in hand is drawn by its pill, which stands where its disc and its name
  // were.
  const isShown = ["!=", ["get", "id"], pinned?.id ?? ""];
  const shown = isShown as never;

  // The tone of the map's place while it waits, which the map covers as it draws.
  if (!drawn) return <View style={{ flex: 1, backgroundColor: colors["neutral-2"] }} />;

  return (
    <MapLibre
      ref={map}
      style={{ flex: 1, backgroundColor: colors["neutral-2"] }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        size.current = { width, height };
        layout();
      }}
      onDidFinishRenderingFrame={() => {
        seaDrawnWhole.current = false;
        if (awaitedSea.current) awaitedSea.current.loading = true;
      }}
      onDidFinishRenderingFrameFully={() => {
        seaDrawnWhole.current = true;
        const awaited = awaitedSea.current;
        if (!awaited) {
          settleSea();
          return;
        }
        if (!awaited.loading) return;
        awaitedSea.current = undefined;
        revealSea(awaited.key);
      }}
      onDidFinishLoadingMap={() => {
        setLoaded(true);
        waitingFit.current?.();
        waitingFit.current = undefined;
      }}
      // The style as it came, which only the names' width was changed in.
      mapStyle={mapStyle}
      // The credits are the map's own box, which the screen draws, and the legend's last line.
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchRotate={false}
      touchPitch={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityValue={accessibilityValue}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onTouchStart={() => {
        movedSinceTouch.current = false;
        markerTookTouch.current = false;
      }}
      onPress={(event) => {
        if (!movedSinceTouch.current && !markerTookTouch.current) void press(event);
      }}
      onLongPress={onLongPress && ((event) => onLongPress(event.nativeEvent.lngLat))}
      onRegionWillChange={(event) => {
        movedSinceTouch.current = true;
        onMoveStart?.(event.nativeEvent.userInteraction);
      }}
      // The middle of the map is read from its corners: the one MapLibre says is the middle of
      // the room the last move left for a sheet.
      onRegionIsChanging={(event) => {
        const { center, zoom: at, bounds } = event.nativeEvent;
        view.current = { center: middleOfBounds(bounds as Bounds, center), zoom: at };
        if (Date.now() - laidOut.current >= LAYOUT_MS) layout();
      }}
      onDidFinishRenderingMapFully={() => void keepOnWater()}
      onRegionDidChange={(event) => {
        const { center: said, zoom: at, bounds, userInteraction } = event.nativeEvent;
        const center = middleOfBounds(bounds as Bounds, said);
        zoom.current = at;
        view.current = { center, zoom: at };
        layout();
        const state = { center, zoom: at, bounds: bounds as Bounds };
        if (remembers) {
          rememberMapState(state);
          try {
            localStorage.setItem(VIEW_KEY, writeView(state));
          } catch {
            // A phone that keeps nothing opens on the default view.
          }
        }
        onMoved(state, userInteraction);
      }}
    >
      {/* No closer than the web's map and an iPhone's come, which Android's would pass, and a
          view kept closer would not be read back. */}
      <Camera
        ref={camera}
        initialViewState={{ center: opening.center, zoom: opening.zoom }}
        maxZoom={MAX_ZOOM}
      />
      <Images images={images} />

      {/* The sea colored by its height and spread to the shore, under the land, which is drawn
          again over it from the basemap's own tiles so that the coast stays sharp, and under the
          land's features, the roads and the names. Without the land the sea is not drawn: it
          would cover the land. */}
      {seaOn && sea && seaPaletteName && land ? (
        <>
          <RasterSource
            // Another theme's land is another source.
            key={land.tiles}
            id={`land:${land.tiles}`}
            tiles={[land.tiles]}
            tileSize={LAND_TILE_SIZE}
            maxzoom={land.maxZoom}
          >
            <Layer
              id={`land:${land.tiles}`}
              type="raster"
              afterId="water"
              // The land appears at once: while it faded in, the sea's colors would show through.
              paint={{ "raster-fade-duration": 0 }}
            />
          </RasterSource>
          {seaSources.map((key) => (
            <RasterSource
              key={key}
              id={`sea:${key}`}
              tiles={[seaTiles(sea.tileUrlTemplate, new Date(momentOf(key)), seaPaletteName)]}
              tileSize={256}
              minzoom={sea.minZoom}
              maxzoom={Math.min(sea.maxZoom, SEA_MAX_ZOOM)}
              attribution={sea.source.attribution}
            >
              <Layer
                id={`sea:${key}`}
                type="raster"
                beforeId={`land:${land.tiles}`}
                paint={{
                  "raster-resampling": "linear",
                  // The first source fades in as its tiles come, and the next over the one before,
                  // which stays under it.
                  "raster-fade-duration": seaSources.length > 1 ? 0 : SEA_FADE_MS,
                  "raster-opacity": key === seaShown || key === seaUnder ? 1 : SEA_COMING,
                  "raster-opacity-transition": { duration: SEA_FADE_MS, delay: 0 },
                }}
              />
            </RasterSource>
          ))}
        </>
      ) : null}
      {layers.arrows && onWater.length > 0 ? (
        <GeoJSONSource id="sea-arrows" data={arrowData}>
          <Layer
            id="sea-arrows"
            type="symbol"
            beforeId={basemap.data?.firstLabel}
            layout={{
              "icon-image": IMAGES.seaArrow,
              "icon-rotate": get("rotate"),
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
            paint={{ "icon-opacity": SEA_ARROW.opacity }}
          />
        </GeoJSONSource>
      ) : null}

      {/* The wind: a dot in the color of its speed, under its badge, or alone where the badge
          has no room. */}
      <GeoJSONSource id="wind" data={windData}>
        <Layer
          id="wind-dots"
          type="circle"
          layout={{ visibility: visible(layers.wind) }}
          paint={{
            "circle-radius": WIND_RADIUS,
            "circle-color": scaleExpression("speed", WIND_SPEED_SCALE),
            "circle-stroke-width": 1,
            "circle-stroke-color": surface,
          }}
        />
      </GeoJSONSource>

      {/* A buoy: a dot in the color of its height, gray when it measured nothing lately, under its
          pill, or alone where the pill has no room. A sheltered site stays small and faded, so
          that it is not read as the sea outside. */}
      <GeoJSONSource id="stations" data={stationData}>
        <Layer
          id="station-dots"
          type="circle"
          layout={{ visibility: visible(layers.buoys) }}
          paint={{
            "circle-radius": [
              "case",
              ["get", "sheltered"],
              SHELTERED_RADIUS,
              BUOY_RADIUS,
            ] as unknown as Expression,
            "circle-opacity": ["case", ["get", "sheltered"], 0.5, 1] as unknown as Expression,
            "circle-color": [
              "case",
              ["<", ["get", "height"], 0],
              NO_READING_COLOR,
              scaleExpression("height", WAVE_HEIGHT_SCALE),
            ] as never,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": surface,
          }}
        />
        <Layer
          id="station-selected"
          type="circle"
          filter={is(selectedStation)}
          layout={{ visibility: visible(layers.buoys) }}
          paint={{
            "circle-radius": BUOY_RING,
            "circle-opacity": 0,
            "circle-stroke-width": 2,
            "circle-stroke-color": ink,
          }}
        />
      </GeoJSONSource>

      {/* A break measures nothing, so it takes no color of a scale: the theme's ink. From afar
          each is a dot, small enough for a coast full of them to stay a coast; closer, a disc with
          a wave in it and its name beside it. One looked at lately is named from afar. */}
      <GeoJSONSource id="breaks" data={breakData}>
        <Layer
          id="break-dots"
          type="circle"
          filter={shown}
          layout={{
            visibility: visible(layers.breaks),
            "circle-sort-key": ["case", isRecent, 1, 0] as never,
          }}
          paint={{
            "circle-radius": byBreakDisc(
              (disc) =>
                [
                  "case",
                  isRecent,
                  Math.max(RECENT_RADIUS, disc.radius),
                  disc.radius,
                ] as unknown as Expression,
            ),
            "circle-color": ink,
            "circle-stroke-width": byBreakDisc((disc) => disc.edge),
            "circle-stroke-color": surface,
          }}
        />
        <Layer
          id="break-names"
          type="symbol"
          minzoom={BREAK_NAME_ZOOM}
          filter={shown}
          layout={{
            visibility: visible(layers.breaks),
            ...nameLayout(byBreakDisc((disc) => (disc.radius + 5) / NAME_SIZE)),
            // Where two names would meet, the one of a break looked at lately is kept.
            "symbol-sort-key": ["case", isRecent, 0, 1] as never,
          }}
          paint={namePaint}
        />
        <Layer
          id="break-recent-names"
          type="symbol"
          maxzoom={BREAK_NAME_ZOOM}
          filter={["all", isRecent, isShown] as never}
          layout={{
            visibility: visible(layers.breaks),
            ...nameLayout(
              byBreakDisc((disc) => (Math.max(RECENT_RADIUS, disc.radius) + 5) / NAME_SIZE),
            ),
          }}
          paint={namePaint}
        />
      </GeoJSONSource>

      {/* The account's own spots stand above the catalogue, in the accent: a disc with a pin in
          it, where a break has a wave. */}
      <GeoJSONSource id="spots" data={spotData}>
        <Layer
          id="spot-dots"
          type="circle"
          filter={shown}
          paint={{
            "circle-radius": byBreakDisc((disc) => Math.max(SPOT_RADIUS, disc.radius)),
            "circle-color": accent,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": surface,
          }}
        />
        <Layer
          id="spot-names"
          type="symbol"
          filter={shown}
          minzoom={SPOT_NAME_ZOOM}
          layout={nameLayout(
            byBreakDisc((disc) => (Math.max(SPOT_RADIUS, disc.radius) + 5) / NAME_SIZE),
          )}
          paint={namePaint}
        />
        <Layer
          id="spot-pins"
          type="symbol"
          filter={shown}
          layout={{
            "icon-image": IMAGES.pin,
            "icon-size": byBreakDisc(
              (disc) => (Math.max(SPOT_RADIUS, disc.radius) * 1.3) / DISC_ICON,
            ),
            "icon-padding": [3, 3, 3, 3],
            "icon-allow-overlap": true,
          }}
        />
      </GeoJSONSource>

      {/* The waves are the layer above the names and the spots, as on the web, so the map places
          them first: a name then finds every disc taken, and covers none. */}
      <Layer
        id="break-waves"
        type="symbol"
        source="breaks"
        minzoom={BREAK_NAME_ZOOM}
        filter={shown}
        layout={{
          visibility: visible(layers.breaks),
          "icon-image": IMAGES.wave,
          // The wave fills the disc, less a margin.
          "icon-size": byBreakDisc((disc) => (disc.radius * 1.3) / DISC_ICON),
          "icon-padding": [3, 3, 3, 3],
          "icon-allow-overlap": true,
        }}
        paint={{
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            BREAK_WAVE_ZOOM,
            0,
            BREAK_WAVE_ZOOM + 0.5,
            1,
          ] as never,
        }}
      />
      {/* The buoys and the wind stations that have room, as the web draws them over its map. */}
      {placed.map((marker) => {
        const isSelected = marker.id === selectedStation;
        const pressAt =
          (longitude: number, latitude: number) => (event: NativeSyntheticEvent<PressEvent>) => {
            markerTookTouch.current = true;
            onPress({
              kind: "station",
              id: marker.id,
              at: [longitude, latitude],
              point: event.nativeEvent.point,
            });
          };
        if (marker.kind === "buoy") {
          const station = stationsById.get(marker.id);
          if (!station || station.heightMeters === null) return null;
          return (
            <Marker
              key={marker.key}
              id={marker.key}
              lngLat={[station.longitude, station.latitude]}
              anchor="center"
              onPress={pressAt(station.longitude, station.latitude)}
              style={{ zIndex: isSelected ? 20 : 0 }}
            >
              <BuoyPill
                heightMeters={station.heightMeters}
                periodSeconds={station.periodSeconds}
                directionDegrees={station.directionDegrees}
                freshness={station.freshness}
                selected={isSelected}
                saved={station.isSaved}
                label={station.label}
              />
            </Marker>
          );
        }
        const station = windById.get(marker.id);
        if (!station) return null;
        return (
          <Marker
            key={marker.key}
            id={marker.key}
            lngLat={[station.longitude, station.latitude]}
            anchor="center"
            // Above its point, so that a buoy that also measures the wind keeps both.
            offset={[0, -WIND_LIFT]}
            onPress={pressAt(station.longitude, station.latitude)}
            style={{ zIndex: isSelected ? 20 : 0 }}
          >
            <WindBadge
              speedKnots={station.speedKnots}
              directionDegrees={station.directionDegrees}
              selected={isSelected}
              label={station.label}
            />
          </Marker>
        );
      })}
      {/* The break or the spot in hand, its disc on its point. On Android a press on it is the
          map's at the finger, as on the web, whose pill lets a press through. On iOS the platform
          says only the pill's own point, where the place in hand is no dot to find: a press there
          keeps what is open. */}
      {pinned ? (
        <Marker
          key={`pinned:${pinned.id}:${pillLeft ? "left" : "right"}`}
          id={`pinned:${pinned.id}:${pillLeft ? "left" : "right"}`}
          lngLat={[pinned.longitude, pinned.latitude]}
          anchor={pillLeft ? "right" : "left"}
          offset={[pillLeft ? BREAK_PILL_POINT : -BREAK_PILL_POINT, 0]}
          onPress={Platform.OS === "android" ? (event) => void press(event) : undefined}
          style={{ zIndex: 20 }}
        >
          <BreakPill
            name={pinned.name}
            selected
            own={selected?.kind === "spot"}
            mirrored={pillLeft}
            onLayout={(event) => setPillWidth(event.nativeEvent.layout.width)}
          />
        </Marker>
      ) : null}
      {/* The spot being added: a pin to take hold of and drag, whose foot is the point. */}
      {draft ? (
        <ViewAnnotation
          id="draft"
          lngLat={[draft.longitude, draft.latitude]}
          anchor="bottom"
          offset={[0, SPOT_PIN_FOOT / 2]}
          draggable
          onDragEnd={(event) => {
            const [longitude, latitude] = event.nativeEvent.lngLat;
            onDraftMoved?.({ latitude, longitude: wrapLongitude(longitude) });
          }}
        >
          <SpotPin />
        </ViewAnnotation>
      ) : null}
      {userLocation ? (
        <Marker
          lngLat={[userLocation.longitude, userLocation.latitude]}
          anchor="center"
          // The platform gives a press on the dot to the dot and not to the map, where the web's
          // passes through it: it is the map's press all the same, at the finger on Android and
          // at the dot's middle on iOS, so that what stands under the dot is still pressed.
          onPress={(event) => void press(event)}
        >
          <UserDot label={m.locate_you_are_here()} />
        </Marker>
      ) : null}
    </MapLibre>
  );
}
