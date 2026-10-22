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
} from "@maplibre/maplibre-react-native";
import { LAND_TILE_SIZE } from "@repo/client/map/land";
import { SEA_ARROW, SEA_MAX_ZOOM } from "@repo/client/map/sea";
import { FINGER_REACH, fitPadding, fitted, MAX_ZOOM, type Padding } from "@repo/client/map/view";
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
import { UserDot } from "./map-markers";
import { useBasemap, useBasemapTiles } from "./use-basemap";
import { type MapState, rememberMapState } from "./map-state";
import { landTiles, seaTiles } from "./drawn-tiles";
import { drawTiles, seaPalette } from "./tile-painter";
import { arrowFeatures, type SeaArrow } from "./sea-arrows";
import {
  boundsAround,
  type Bounds,
  type LngLat,
  type MapPoint,
  type MapView,
  readView,
  STYLE_URLS,
  VIEW_KEY,
  writeView,
} from "./view";

// The map, the web's `StationMap` drawn by MapLibre Native: OpenFreeMap's basemap in the theme in
// force, the sea colored by its height under its names (decision 018), and over them the stations,
// the surf breaks and the account's own spots, each a source of GeoJSON that the map draws and
// places itself, with the colors of the sea's scales. North stays up, so that an arrow drawn on it
// points the right way. A press opens what is nearest the finger; a press held puts a new spot.
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
  /** Brings a point to the middle of the map, no further out than `zoom`. */
  focus: (point: MapPoint, zoom?: number) => void;
  /**
   * Shows these points together, no closer than a bay, inside what the screen's bars cover at
   * the top and at the bottom.
   */
  fit: (points: readonly MapPoint[], covered?: Partial<Padding>) => void;
  /** Moves the map so that a point the finger pressed stands where `y` is, from the top. */
  lift: (point: [number, number], y: number) => void;
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
  layers: MapLayers;
  sea: SeaMap | undefined;
  seaTime: Date | undefined;
  arrows: readonly SeaArrow[];
  // Where the reader was found, once they asked.
  userLocation: MapPoint | null;
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

// The layers a press can land on: the dots, and a buoy's figures, which stand beside its dot as
// the web's pill holds them and open the buoy as the pill does.
const DOT_LAYERS = ["spot-dots", "break-dots", "station-dots", "wind-dots", "station-figures"];
// What a selected place's ring adds to its disc.
const RING = 5;
// How long the map takes to go somewhere it was asked to.
const MOVE_MS = 600;
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
  layers,
  sea,
  seaTime,
  arrows,
  userLocation,
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
  // How large the map is drawn, which a list is fitted in.
  const size = useRef({ width: 0, height: 0 });

  // The basemap's style, which the map waits for: its names are given the web's width. One that
  // could not be read is read by the map from its address as it is.
  const basemap = useBasemap(scheme);
  // Whether the map was drawn once. It then stays, as the web's does, and only its style changes
  // with the theme: drawn anew, it would open where it first opened and lose the reader's view.
  const [drawn, setDrawn] = useState(false);
  if (!basemap.isPending && !drawn) setDrawn(true);
  // A list fitted before the map was drawn, which is fitted once it is.
  const waitingFit = useRef<(() => void) | undefined>(undefined);
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

  useImperativeHandle(
    ref,
    () => ({
      focus: (point, at) =>
        camera.current?.easeTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(zoom.current, at ?? 0),
          padding: NO_PADDING,
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
      lift: (point, y) => {
        const instance = map.current;
        if (!instance) return;
        // The middle moves down by as much as the point stands below where it should.
        void (async () => {
          const [x, middle] = await instance.project(await instance.getCenter());
          const target = await instance.unproject([x, middle + (point[1] - y)]);
          camera.current?.easeTo({ center: target, padding: NO_PADDING, duration });
        })().catch(() => {
          // A map that is gone moves nowhere.
        });
      },
    }),
    [duration],
  );

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
  // Each moment of the sea is a source of its own. The one in view stays until the next has its
  // tiles, then one fades into the other, so that the sea never goes blank between two moments.
  // MapLibre says once a style is loaded that the map is drawn, and then only frame by frame: the
  // coming moment is shown at the first frame drawn whole after one that waited for tiles.
  const seaMoment = seaTime?.toISOString();
  const [seaState, setSeaState] = useState<{ shown?: string; going?: string }>({
    shown: seaMoment,
  });
  const seaOn = Boolean(layers.sea && sea && seaTime && seaPaletteName && land);
  // The first moment is shown at once, and a sea not drawn shows the moment in force once it is.
  if (
    (!seaOn || seaState.shown === undefined) &&
    (seaState.shown !== seaMoment || seaState.going !== undefined)
  ) {
    setSeaState({ shown: seaMoment });
  }
  const { shown: seaShown, going: seaGoing } = seaState;
  const comingSea = seaOn && seaMoment !== seaShown ? seaMoment : undefined;
  const comesBack = comingSea !== undefined && comingSea === seaGoing;
  const seaMoments = [...new Set([seaGoing, seaShown, comingSea])].filter(
    (moment): moment is string => moment !== undefined,
  );
  const revealSea = useCallback(
    (moment: string) =>
      setSeaState((state) =>
        state.shown === moment ? state : { shown: moment, going: state.shown },
      ),
    [],
  );
  // The moment whose tiles come, and whether a frame was drawn without all of them.
  const awaitedSea = useRef<{ moment: string; loading: boolean } | undefined>(undefined);
  useEffect(() => {
    awaitedSea.current = undefined;
    if (comingSea === undefined) return;
    // The moment that fades out still has its tiles.
    if (comesBack) {
      revealSea(comingSea);
      return;
    }
    awaitedSea.current = { moment: comingSea, loading: false };
    // A moment whose tiles do not come does not hold the sea back for ever.
    const timer = setTimeout(() => revealSea(comingSea), SEA_WAIT_MS);
    return () => clearTimeout(timer);
  }, [comingSea, comesBack, revealSea]);
  // Gone once it has faded.
  useEffect(() => {
    if (seaGoing === undefined) return;
    const timer = setTimeout(() => setSeaState((state) => ({ shown: state.shown })), SEA_FADE_MS);
    return () => clearTimeout(timer);
  }, [seaGoing]);
  const stationData = useMemo(() => stationFeatures(stations), [stations]);
  const windData = useMemo(() => windFeatures(wind), [wind]);
  const breakData = useMemo(() => placeFeatures(breaks, "break"), [breaks]);
  const spotData = useMemo(() => placeFeatures(spots, "spot"), [spots]);
  const arrowData = useMemo(() => arrowFeatures(arrows), [arrows]);
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
  const ring = (radius: number | Expression) => ({
    "circle-radius": radius,
    "circle-opacity": 0,
    "circle-stroke-width": 2,
    "circle-stroke-color": ink,
  });

  // The tone of the map's place while it waits, which the map covers as it draws.
  if (!drawn) return <View style={{ flex: 1, backgroundColor: colors["neutral-2"] }} />;

  return (
    <MapLibre
      ref={map}
      style={{ flex: 1, backgroundColor: colors["neutral-2"] }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        size.current = { width, height };
      }}
      onDidFinishRenderingFrame={() => {
        if (awaitedSea.current) awaitedSea.current.loading = true;
      }}
      onDidFinishRenderingFrameFully={() => {
        const awaited = awaitedSea.current;
        if (!awaited?.loading) return;
        awaitedSea.current = undefined;
        revealSea(awaited.moment);
      }}
      onDidFinishLoadingMap={() => {
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
      onPress={(event) => void press(event)}
      onLongPress={onLongPress && ((event) => onLongPress(event.nativeEvent.lngLat))}
      onRegionWillChange={
        onMoveStart && ((event) => onMoveStart(event.nativeEvent.userInteraction))
      }
      onRegionDidChange={(event) => {
        const { center, zoom: at, bounds, userInteraction } = event.nativeEvent;
        zoom.current = at;
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
          {seaMoments.map((moment) => (
            <RasterSource
              key={moment}
              id={`sea:${moment}`}
              tiles={[seaTiles(sea.tileUrlTemplate, new Date(moment), seaPaletteName)]}
              tileSize={256}
              minzoom={sea.minZoom}
              maxzoom={Math.min(sea.maxZoom, SEA_MAX_ZOOM)}
              attribution={sea.source.attribution}
            >
              <Layer
                id={`sea:${moment}`}
                type="raster"
                beforeId={`land:${land.tiles}`}
                paint={{
                  "raster-resampling": "linear",
                  // The first moment fades in as its tiles come, and the next into the one before.
                  "raster-fade-duration": seaMoments.length > 1 ? 0 : SEA_FADE_MS,
                  "raster-opacity": moment === seaShown ? 1 : moment === seaGoing ? 0 : SEA_COMING,
                  "raster-opacity-transition": { duration: SEA_FADE_MS, delay: 0 },
                }}
              />
            </RasterSource>
          ))}
        </>
      ) : null}
      {layers.arrows && arrows.length > 0 ? (
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

      {/* The wind: a disc in the color of its speed, which it writes when there is room, and an
          arrow at its edge that points the way it blows. */}
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
        <Layer
          id="wind-arrows"
          type="symbol"
          filter={["!=", ["get", "arrow"], ""] as never}
          layout={{
            visibility: visible(layers.wind),
            "icon-image": get("arrow"),
            "icon-size": 0.8,
            "icon-rotate": get("rotate"),
            "icon-rotation-alignment": "map",
            "icon-offset": [0, -(WIND_RADIUS + 5) / 0.8],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          }}
        />
        <Layer
          id="wind-figures"
          type="symbol"
          layout={{
            visibility: visible(layers.wind),
            "text-field": get("figure"),
            "text-font": BOLD_FONT,
            "text-size": 10,
          }}
          paint={{ "text-color": get("ink") as never }}
        />
        <Layer
          id="wind-selected"
          type="circle"
          filter={is(selected?.kind === "station" ? selected.id : undefined)}
          layout={{ visibility: visible(layers.wind) }}
          paint={ring(WIND_RADIUS + RING)}
        />
      </GeoJSONSource>

      {/* A buoy: a disc in the color of its height, with the arrow of its waves in it, and its
          height and period beside it when there is room. A reading that ages pales; a sheltered
          site stays small and faded, so that it is not read as the sea outside. */}
      <GeoJSONSource id="stations" data={stationData}>
        <Layer
          id="station-dots"
          type="circle"
          layout={{
            visibility: visible(layers.buoys),
            "circle-sort-key": get("height") as never,
          }}
          paint={{
            "circle-radius": [
              "case",
              ["get", "sheltered"],
              SHELTERED_RADIUS,
              ["<", ["get", "height"], 0],
              SHELTERED_RADIUS + 1,
              BUOY_RADIUS,
            ] as unknown as Expression,
            "circle-opacity": [
              "case",
              ["get", "sheltered"],
              0.5,
              ["get", "fade"],
            ] as unknown as Expression,
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
          id="station-arrows"
          type="symbol"
          filter={["!=", ["get", "arrow"], ""] as never}
          layout={{
            visibility: visible(layers.buoys),
            "icon-image": get("arrow"),
            "icon-rotate": get("rotate"),
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          }}
        />
        <Layer
          id="station-figures"
          type="symbol"
          filter={[">=", ["get", "height"], 0] as never}
          layout={{
            visibility: visible(layers.buoys),
            "text-field": get("figures"),
            "text-font": BOLD_FONT,
            "text-size": NAME_SIZE,
            "text-variable-anchor": ["left", "right", "top", "bottom"],
            "text-radial-offset": (BUOY_RADIUS + 4) / NAME_SIZE,
            // The biggest seas are written first.
            "symbol-sort-key": ["-", ["get", "height"]] as never,
          }}
          paint={namePaint}
        />
        <Layer
          id="station-selected"
          type="circle"
          filter={is(selected?.kind === "station" ? selected.id : undefined)}
          layout={{ visibility: visible(layers.buoys) }}
          paint={ring(BUOY_RADIUS + RING)}
        />
      </GeoJSONSource>

      {/* A break measures nothing, so it takes no color of a scale: the theme's ink. From afar
          each is a dot, small enough for a coast full of them to stay a coast; closer, a disc with
          a wave in it and its name beside it. One looked at lately is named from afar. */}
      <GeoJSONSource id="breaks" data={breakData}>
        <Layer
          id="break-dots"
          type="circle"
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
          filter={isRecent as never}
          layout={{
            visibility: visible(layers.breaks),
            ...nameLayout(
              byBreakDisc((disc) => (Math.max(RECENT_RADIUS, disc.radius) + 5) / NAME_SIZE),
            ),
          }}
          paint={namePaint}
        />
        <Layer
          id="break-selected"
          type="circle"
          filter={is(selected?.kind === "break" ? selected.id : undefined)}
          layout={{ visibility: visible(layers.breaks) }}
          paint={ring(byBreakDisc((disc) => Math.max(RECENT_RADIUS, disc.radius) + RING))}
        />
      </GeoJSONSource>

      {/* The account's own spots stand above the catalogue, in the accent: a disc with a pin in
          it, where a break has a wave. */}
      <GeoJSONSource id="spots" data={spotData}>
        <Layer
          id="spot-dots"
          type="circle"
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
          minzoom={SPOT_NAME_ZOOM}
          layout={nameLayout(
            byBreakDisc((disc) => (Math.max(SPOT_RADIUS, disc.radius) + 5) / NAME_SIZE),
          )}
          paint={namePaint}
        />
        <Layer
          id="spot-pins"
          type="symbol"
          layout={{
            "icon-image": IMAGES.pin,
            "icon-size": byBreakDisc(
              (disc) => (Math.max(SPOT_RADIUS, disc.radius) * 1.3) / DISC_ICON,
            ),
            "icon-padding": [3, 3, 3, 3],
            "icon-allow-overlap": true,
          }}
        />
        <Layer
          id="spot-selected"
          type="circle"
          filter={is(selected?.kind === "spot" ? selected.id : undefined)}
          paint={ring(byBreakDisc((disc) => Math.max(SPOT_RADIUS, disc.radius) + RING))}
        />
      </GeoJSONSource>

      {/* The waves are the layer above the names and the spots, as on the web, so the map places
          them first: a name then finds every disc taken, and covers none. */}
      <Layer
        id="break-waves"
        type="symbol"
        source="breaks"
        minzoom={BREAK_NAME_ZOOM}
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
