import { Camera, Map as MapView } from "@maplibre/maplibre-react-native";
import { MapPinIcon } from "@repo/ui/icon";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glyph } from "@/components/shared/glyph";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// Moving a spot of the account's own, as the web's `SpotEditor` moves its marker: here the pin
// stays at the middle of the map and the map moves under it, as a phone's apps place a point,
// so that the finger never covers where it goes. Cancel, a swipe or the back of Android ask
// before a spot that moved is left where it was. The map is the web's, OpenFreeMap's, which
// credits OpenStreetMap in its corner. Decision 006.

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const PIN = 36;

export function MoveSpot({ id }: { id: string }) {
  const { colors, space, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { spot, isOwner } = usePlaceRecord("spot", id);
  const actions = useSpotActions();
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>();
  const moved =
    spot !== undefined &&
    center !== undefined &&
    (Math.abs(center.latitude - spot.latitude) > 1e-6 ||
      Math.abs(center.longitude - spot.longitude) > 1e-6);
  const guard = useSheetGuard(moved && !actions.isChanging);

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader
        title={spot ? m.native_spot_move_title({ name: spot.name }) : m.native_spot_move()}
        onCancel={guard.cancel}
        onSave={() => {
          if (!spot || !center || !isOwner) return;
          actions.move(spot, center, guard.close);
        }}
        saveLabel={m.spot_edit_save()}
        canSave={moved}
        saving={actions.isChanging}
      />
      <Text size="s" tone="muted" style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
        {m.native_spot_move_hint()}
      </Text>
      {spot ? (
        <View style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            mapStyle={STYLES[scheme]}
            logo={false}
            compass={false}
            accessibilityLabel={m.native_spot_move_map()}
            onRegionDidChange={(event) => {
              const [longitude, latitude] = event.nativeEvent.center;
              setCenter({ latitude, longitude });
            }}
          >
            <Camera initialViewState={{ center: [spot.longitude, spot.latitude], zoom: 15 }} />
          </MapView>
          {/* The pin's point is the middle of the map: it stands on it, and takes no touch. */}
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              marginLeft: -PIN / 2,
              marginTop: -PIN,
            }}
          >
            <Glyph icon={MapPinIcon} size={PIN} color={colors["color-1"]} />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, padding: space.m }}>
          <Skeleton height={320} />
        </View>
      )}
      <View
        style={{
          paddingHorizontal: space.m,
          paddingTop: space.s,
          paddingBottom: insets.bottom + space.s,
        }}
      >
        <Text size="xs" tone="muted" numeric>
          {center
            ? `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}`
            : spot
              ? `${spot.latitude.toFixed(5)}, ${spot.longitude.toFixed(5)}`
              : " "}
        </Text>
      </View>
    </View>
  );
}
