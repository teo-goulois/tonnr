import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Field } from "@/components/auth/field";
import { DEFAULT_LAYERS } from "@/components/map/layers";
import { type Heading, NAME_MOST, nudged, writePoint } from "@/components/map/new-spot";
import { BREAK_LIMIT, MINUTE_MS, spotsQuery } from "@/components/map/queries";
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

// Renaming a spot of the account's own and moving it, in one sheet, as the web's `SpotEditor`
// does both with the marker of `NewSpotPanel`: its name in a field, and the marker of a new spot,
// which a finger drags, a press on the map brings to the point pressed, and a screen reader moves a
// step at a time, all as the new spot's sheet does. The spot itself is drawn by its marker alone
// while it moves. Saved, the name and the point go together. A name left empty is said under its
// field, as the web says it. Cancel, a swipe or the back of Android ask before a spot renamed or
// moved is left as it was. Decision 006.

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
  const keyboardShown = useKeyboardState((state) => state.isVisible);
  const { signedIn } = useAccount();
  const { spot, isOwner } = usePlaceRecord("spot", id);
  const actions = useSpotActions();
  const map = useRef<StationMapHandle>(null);
  // The name once the person typed it. Until then, the spot's.
  const [name, setName] = useState<string>();
  const [missing, setMissing] = useState(false);
  // Where the marker stands once the person moved it. Until then, where the spot is.
  const [point, setPoint] = useState<MapPoint>();
  const [bounds, setBounds] = useState<Bounds | null>(null);
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
  const written = name ?? spot?.name ?? "";
  const renamed = spot !== undefined && name !== undefined && name.trim() !== spot.name;
  const moved =
    spot !== undefined &&
    point !== undefined &&
    (Math.abs(point.latitude - spot.latitude) > 1e-6 ||
      Math.abs(point.longitude - spot.longitude) > 1e-6);
  const guard = useSheetGuard((renamed || moved) && !actions.isChanging);

  /** Puts the marker at `next`, where the map shows it already. */
  function putAt(next: MapPoint) {
    feel("select");
    setPoint(next);
  }

  function save() {
    if (!spot || !at || !isOwner || actions.isChanging) return;
    const trimmed = written.trim();
    if (!trimmed) {
      setMissing(true);
      return;
    }
    Keyboard.dismiss();
    actions.edit(
      spot,
      { name: trimmed, latitude: at.latitude, longitude: at.longitude },
      guard.close,
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SheetHeader
        title={spot?.name ?? m.spot_edit()}
        onCancel={guard.cancel}
        onSave={save}
        saveLabel={m.spot_edit_save()}
        canSave={spot !== undefined}
        saving={actions.isChanging}
      />
      {/* The keyboard pushes up what is typed in: the map gives way to it. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        {spot ? (
          <View style={{ flex: 1, overflow: "hidden" }}>
            <StationMap
              ref={map}
              stations={[]}
              wind={[]}
              breaks={breaks.data?.breaks ?? []}
              spots={(spots.data ?? []).filter((one) => one.id !== id)}
              selected={undefined}
              layers={LAYERS}
              sea={undefined}
              seaTime={undefined}
              arrows={[]}
              userLocation={null}
              draft={at}
              draftLabel={m.native_spot_marker()}
              onDraftMoved={putAt}
              opening={{ center: [spot.longitude, spot.latitude], zoom: SPOT_ZOOM }}
              remembers={false}
              accessibilityLabel={m.native_spot_marker()}
              accessibilityHint={m.spot_marker_hint()}
              accessibilityValue={at ? { text: writePoint(at) } : undefined}
              accessibilityActions={HEADINGS.map((heading) => ({
                name: heading,
                label: HEADING_LABELS[heading](),
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
              onMoved={(state) => {
                if (state.bounds) setBounds(state.bounds);
              }}
            />
          </View>
        ) : (
          <View style={{ flex: 1, padding: space.m }}>
            <Skeleton height={320} />
          </View>
        )}
        {/* The web's form: the name, then where the marker stands. */}
        <View
          style={{
            gap: space.m,
            paddingHorizontal: space.m,
            paddingTop: space.s,
            paddingBottom: keyboardShown ? space.s : Math.max(insets.bottom, space.s),
          }}
        >
          <Field
            label={m.spot_name_label()}
            placeholder={m.spot_name_placeholder()}
            value={written}
            onChangeText={(next) => {
              setName(next);
              if (next.trim()) setMissing(false);
            }}
            error={missing ? m.spot_name_missing() : undefined}
            maxLength={NAME_MOST}
            disabled={!spot || actions.isChanging}
            autoComplete="off"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={save}
          />
          <View style={{ gap: space.xxs }}>
            <Text size="s" tone="muted">
              {m.spot_marker_hint()}
            </Text>
            <Text size="xs" tone="muted" numeric>
              {at ? writePoint(at) : " "}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
