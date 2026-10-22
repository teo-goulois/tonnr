import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_LAYERS } from "@/components/map/layers";
import { type Heading, nudged, writePoint } from "@/components/map/new-spot";
import { BREAK_LIMIT, MINUTE_MS, spotsQuery } from "@/components/map/queries";
import { SpotPin } from "@/components/map/spot-pin";
import { StationMap, type StationMapHandle } from "@/components/map/station-map";
import {
  bboxOf,
  type Bounds,
  type MapPoint,
  SPOT_ZOOM,
  visibleBounds,
} from "@/components/map/view";
import { feel } from "@/components/ui/haptics";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// Moving a spot of the account's own, as the web's `SpotEditor` moves it with the marker of
// `NewSpotPanel`: here the marker of a new spot, `SpotPin`, stands in the middle of the map and the
// map moves under it, a press on the map brings the point pressed there, and a screen reader
// moves it a step at a time, all as the new spot's sheet does. Cancel, a swipe or the back of
// Android ask before a spot that moved is left where it was. Decision 006.

// What this map draws: the surf breaks and the account's own spots, to put a spot beside them.
// Nothing of the sea.
const LAYERS = { ...DEFAULT_LAYERS, sea: false, arrows: false, buoys: false, wind: false };
const HEADINGS: readonly Heading[] = ["north", "south", "east", "west"];
const HEADING_LABELS: Record<Heading, () => string> = {
  north: m.native_spot_move_north,
  south: m.native_spot_move_south,
  east: m.native_spot_move_east,
  west: m.native_spot_move_west,
};

export function MoveSpot({ id }: { id: string }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAccount();
  const { spot, isOwner } = usePlaceRecord("spot", id);
  const actions = useSpotActions();
  const map = useRef<StationMapHandle>(null);
  // Where the marker stands once the person moved it. Until then, where the spot is.
  const [point, setPoint] = useState<MapPoint>();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [moving, setMoving] = useState(false);
  const spots = useQuery(spotsQuery(signedIn));
  const breaks = useQuery(
    orpc.v1.breaks.list.queryOptions({
      input: { bbox: bounds ? bboxOf(visibleBounds(bounds)) : "", limit: BREAK_LIMIT },
      enabled: bounds !== null,
      placeholderData: keepPreviousData,
      // The catalogue changes when its operator adds to it by hand.
      staleTime: 60 * MINUTE_MS,
    }),
  );

  const at = point ?? spot;
  const moved =
    spot !== undefined &&
    point !== undefined &&
    (Math.abs(point.latitude - spot.latitude) > 1e-6 ||
      Math.abs(point.longitude - spot.longitude) > 1e-6);
  const guard = useSheetGuard(moved && !actions.isChanging);

  /** Puts the marker at `next`, and brings the map there. */
  function putAt(next: MapPoint) {
    feel("select");
    setPoint(next);
    map.current?.focus(next);
  }

  return (
    <View className="flex-1 bg-background">
      <SheetHeader
        title={spot ? m.native_spot_move_title({ name: spot.name }) : m.native_spot_move()}
        onCancel={guard.cancel}
        onSave={() => {
          if (!spot || !point || !isOwner) return;
          actions.move(spot, point, guard.close);
        }}
        saveLabel={m.spot_edit_save()}
        canSave={moved}
        saving={actions.isChanging}
      />
      {spot ? (
        <View style={{ flex: 1, overflow: "hidden" }}>
          <StationMap
            ref={map}
            stations={[]}
            wind={[]}
            breaks={breaks.data?.breaks ?? []}
            spots={spots.data ?? []}
            selected={undefined}
            layers={LAYERS}
            sea={undefined}
            seaTime={undefined}
            arrows={[]}
            userLocation={null}
            opening={{ center: [spot.longitude, spot.latitude], zoom: SPOT_ZOOM }}
            remembers={false}
            accessibilityLabel={m.native_spot_marker()}
            accessibilityHint={m.native_spot_move_hint()}
            accessibilityValue={at ? { text: writePoint(at) } : undefined}
            accessibilityActions={HEADINGS.map((name) => ({
              name,
              label: HEADING_LABELS[name](),
            }))}
            onAccessibilityAction={(event) => {
              const heading = event.nativeEvent.actionName as Heading;
              if (at && bounds && HEADINGS.includes(heading)) {
                putAt(nudged(at, bounds, heading));
              }
            }}
            onPress={({ at: [longitude, latitude] }) => putAt({ latitude, longitude })}
            onMapPress={([longitude, latitude]) => putAt({ latitude, longitude })}
            onLongPress={([longitude, latitude]) => putAt({ latitude, longitude })}
            onMoveStart={() => setMoving(true)}
            onMoved={(state, byHand) => {
              setMoving(false);
              if (state.bounds) setBounds(state.bounds);
              // Moved by a finger, the marker goes with the middle of the map. Moved by a press,
              // it stands where it was put.
              if (byHand) setPoint({ latitude: state.center[1], longitude: state.center[0] });
            }}
          />
          <SpotPin lifted={moving} />
        </View>
      ) : (
        <View style={{ flex: 1, padding: space.m }}>
          <Skeleton height={320} />
        </View>
      )}
      <View
        style={{
          gap: space.xxs,
          paddingHorizontal: space.m,
          paddingTop: space.s,
          paddingBottom: Math.max(insets.bottom, space.s),
        }}
      >
        <Text size="s" tone="muted">
          {m.native_spot_move_hint()}
        </Text>
        <Text size="xs" tone="muted" numeric>
          {at ? writePoint(at) : " "}
        </Text>
      </View>
    </View>
  );
}
