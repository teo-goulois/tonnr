import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapLibre,
  type MapRef,
  NativeUserLocation,
  type PressEventWithFeatures,
  RasterDEMSource,
} from "@maplibre/maplibre-react-native";
import { WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, NO_READING_COLOR } from "@repo/client/sea-scales";
import { type Ref, useImperativeHandle, useMemo, useRef, useState } from "react";
import type {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  NativeSyntheticEvent,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

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
import { type MapState, rememberMapState } from "./map-state";
import { SEA_ENCODING, SEA_MAX_ZOOM, seaReliefColor, seaTileUrl } from "./sea";
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
  /** Shows these points together. */
  fit: (points: readonly MapPoint[]) => void;
  /** Moves the map so that a point the finger pressed stands where `y` is, from the top. */
  lift: (point: [number, number], y: number) => void;
  /** Opens the map's credits, as the platform lists them. */
  showCredits: () => void;
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
  // Where the reader is, once they asked to be found.
  located: boolean;
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

// The first name of each basemap, under which the arrows of the sea are drawn: a name is read
// over them.
const FIRST_LABEL = { light: "waterway_line_label", dark: "water_name" } as const;
// What a selected place's ring adds to its disc.
const RING = 5;
// How long the map takes to go somewhere it was asked to.
const MOVE_MS = 600;
// A list on one beach is shown no closer than a bay: its box is never smaller than this.
const FIT_SPAN = 0.04;
const FIT_PADDING = { top: 120, right: 72, bottom: 200, left: 72 };

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
  located,
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
          duration,
        }),
      fit: (points) => {
        const box = boundsAround(points);
        if (!box) return;
        const [west, south, east, north] = box;
        const widen = (span: number) => Math.max(0, (FIT_SPAN - span) / 2);
        const across = widen(east - west);
        const up = widen(north - south);
        camera.current?.fitBounds([west - across, south - up, east + across, north + up], {
          padding: FIT_PADDING,
          duration,
          easing: "ease",
        });
      },
      lift: (point, y) => {
        const instance = map.current;
        if (!instance) return;
        // The middle moves down by as much as the point stands below where it should.
        void (async () => {
          const [x, middle] = await instance.project(await instance.getCenter());
          const target = await instance.unproject([x, middle + (point[1] - y)]);
          camera.current?.easeTo({ center: target, duration });
        })().catch(() => {
          // A map that is gone moves nowhere.
        });
      },
      showCredits: () => void map.current?.showAttribution(),
    }),
    [duration],
  );

  const press = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const { features, lngLat, point } = event.nativeEvent;
    const found = pressed(features, lngLat);
    if (!found) return;
    event.stopPropagation();
    onPress({ ...found, point });
  };

  const relief = useMemo(
    () => (sea ? seaReliefColor(sea.encoding.metersByLevel) : undefined),
    [sea],
  );
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

  return (
    <MapLibre
      ref={map}
      style={{ flex: 1, backgroundColor: colors["neutral-2"] }}
      mapStyle={STYLE_URLS[scheme]}
      // The credits are the legend's last line, which opens the platform's list of them.
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
      onPress={onMapPress && ((event) => onMapPress(event.nativeEvent.lngLat))}
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
      <Camera
        ref={camera}
        initialViewState={{ center: opening.center, zoom: opening.zoom }}
        maxZoom={18}
      />
      <Images images={images} />

      {/* The sea colored by its height, read as a relief over the water and under the land's
          features, the roads and the names. */}
      {layers.sea && sea && seaTime && relief ? (
        <RasterDEMSource
          // A new moment is a new source: the map asks for its tiles.
          key={seaTime.toISOString()}
          id="sea"
          tiles={[seaTileUrl(sea.tileUrlTemplate, seaTime)]}
          tileSize={256}
          minzoom={sea.minZoom}
          maxzoom={Math.min(sea.maxZoom, SEA_MAX_ZOOM)}
          encoding={SEA_ENCODING}
          attribution={sea.source.attribution}
        >
          <Layer
            id="sea-relief"
            type="color-relief"
            afterId="water"
            paint={{ "color-relief-color": relief as never, "color-relief-opacity": 1 }}
          />
        </RasterDEMSource>
      ) : null}
      {layers.arrows && arrows.length > 0 ? (
        <GeoJSONSource id="sea-arrows" data={arrowData}>
          <Layer
            id="sea-arrows"
            type="symbol"
            beforeId={FIRST_LABEL[scheme]}
            layout={{
              "icon-image": IMAGES.seaArrow,
              "icon-rotate": get("rotate"),
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
            paint={{ "icon-opacity": 0.85 }}
          />
        </GeoJSONSource>
      ) : null}

      {/* The wind: a disc in the color of its speed, which it writes when there is room, and an
          arrow at its edge that points the way it blows. */}
      <GeoJSONSource id="wind" data={windData} onPress={press}>
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

      {/* A break measures nothing, so it takes no color of a scale: the theme's ink. From afar
          each is a dot, small enough for a coast full of them to stay a coast; closer, a disc with
          a wave in it and its name beside it. One looked at lately is named from afar. */}
      <GeoJSONSource id="breaks" data={breakData} onPress={press}>
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
          id="break-waves"
          type="symbol"
          minzoom={BREAK_NAME_ZOOM}
          layout={{
            visibility: visible(layers.breaks),
            "icon-image": IMAGES.wave,
            // The wave fills the disc, less a margin.
            "icon-size": byBreakDisc((disc) => (disc.radius * 1.3) / DISC_ICON),
            "icon-padding": 3,
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
        <Layer
          id="break-selected"
          type="circle"
          filter={is(selected?.kind === "break" ? selected.id : undefined)}
          layout={{ visibility: visible(layers.breaks) }}
          paint={ring(byBreakDisc((disc) => Math.max(RECENT_RADIUS, disc.radius) + RING))}
        />
      </GeoJSONSource>

      {/* A buoy: a disc in the color of its height, with the arrow of its waves in it, and its
          height and period beside it when there is room. A reading that ages pales; a sheltered
          site stays small and faded, so that it is not read as the sea outside. */}
      <GeoJSONSource id="stations" data={stationData} onPress={press}>
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

      {/* The account's own spots stand above the catalogue, in the accent: a disc with a pin in
          it, where a break has a wave. */}
      <GeoJSONSource id="spots" data={spotData} onPress={press}>
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
            "icon-padding": 3,
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

      {located ? <NativeUserLocation /> : null}
    </MapLibre>
  );
}
