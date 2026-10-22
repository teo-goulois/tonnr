import { LocateIcon, LockIcon, PinIcon } from "@repo/ui/icon";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FoundList } from "@/components/search/found-list";
import type { Found } from "@/components/search/found";
import { SearchField } from "@/components/search/search-field";
import { usePlaceSearch } from "@/components/search/use-place-search";
import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { SheetHeader, useSheetGuard } from "@/components/ui/sheet";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { DEFAULT_LAYERS } from "./layers";
import { useLocate } from "./locate";
import { currentMapState, moveMap } from "./map-state";
import {
  createInput,
  draftAt,
  type Heading,
  NAME_MOST,
  nearOf,
  nudged,
  placedAt,
  pointOf,
  type SpotDraft,
  stepFrom,
  writePoint,
} from "./new-spot";
import { newSpotHref, placeHref } from "./place-route";
import { BREAK_LIMIT, MINUTE_MS, SPOTS_MOST, spotsQuery } from "./queries";
import { type MapPress, StationMap, type StationMapHandle } from "./station-map";
import {
  bboxOf,
  BREAK_ZOOM,
  type Bounds,
  type LngLat,
  type MapPoint,
  type MapView,
  middleOf,
  SPOT_ZOOM,
  visibleBounds,
} from "./view";

// Adding a spot of the account's own (decision 006): finding the place, putting the marker and
// naming it, in that order, as the web's `NewSpotPanel` does it, in a sheet of the platform's. A
// press on the map puts the marker there, a finger drags it from there, and a press on a surf break
// puts it on the break, which the spot is then made from. The search finds the breaks and the
// places by their name, and the phone says where the reader is. A spot of the account's or a break
// within 150 metres is said, with what goes to it.
// Saved, the spot's sheet takes this one's place, over the map that has gone there.

// What this map draws: the surf breaks, to put a spot on one, and the account's own spots, which
// no switch hides. Nothing of the sea.
const LAYERS = { ...DEFAULT_LAYERS, sea: false, arrows: false, buoys: false, wind: false };
const HEADINGS: readonly Heading[] = ["north", "south", "east", "west"];
const HEADING_LABELS: Record<Heading, () => string> = {
  north: m.native_spot_move_north,
  south: m.native_spot_move_south,
  east: m.native_spot_move_east,
  west: m.native_spot_move_west,
};

/** Where the sheet opens: on the point a press held on the map gave, else where the map is. */
function openingOf(latitude: unknown, longitude: unknown): { view: MapView; draft: SpotDraft } {
  const state = currentMapState();
  const given = pointOf(latitude, longitude);
  if (given) {
    return {
      // Close enough to tell a beach from the next, where a press held from afar is a town.
      view: { center: [given.longitude, given.latitude], zoom: Math.max(state.zoom, SPOT_ZOOM) },
      draft: draftAt(given, true),
    };
  }
  return {
    view: { center: state.center, zoom: state.zoom },
    draft: draftAt({ latitude: state.center[1], longitude: state.center[0] }, false),
  };
}

export function NewSpotScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const requireAccount = useRequireAccount();
  const tell = useTell();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardState((state) => state.isVisible);
  const params = useLocalSearchParams<{ latitude?: string; longitude?: string }>();
  const [opening] = useState(() => openingOf(params.latitude, params.longitude));
  const [draft, setDraft] = useState(opening.draft);
  // Whether the person did anything here that leaving would lose.
  const [touched, setTouched] = useState(false);
  // The spot once it is saved: its sheet then takes this one's place.
  const [made, setMade] = useState<string>();
  const map = useRef<StationMapHandle>(null);
  // What the map shows, which the breaks are asked for and a step of the marker is measured on.
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const { point: located, isLocating, locate } = useLocate();

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
  // What is near the middle of the map is found first, the places and the breaks alike.
  const middle = useMemo(
    () =>
      middleOf(bounds) ?? {
        latitude: opening.view.center[1],
        longitude: opening.view.center[0],
        zoom: Math.round(opening.view.zoom),
      },
    [bounds, opening],
  );
  const search = usePlaceSearch({ near: middle, withPlaces: signedIn });
  const nearby = nearOf(draft, spots.data, breaks.data?.breaks);

  // What stands near the marker is said to who cannot see it, as it changes.
  const nearSaid = [
    nearby.spot && m.spot_near({ name: nearby.spot.name }),
    nearby.break && m.native_spot_near_break({ name: nearby.break.name }),
  ]
    .filter(Boolean)
    .join(" ");
  useEffect(() => {
    if (nearSaid) AccessibilityInfo.announceForAccessibility(nearSaid);
  }, [nearSaid]);

  // What to do with the marker, as the web says it: where to put it until it is put somewhere, then
  // how to move it.
  const hint = draft.placed ? m.spot_marker_hint() : m.spot_place_hint();

  const guard = useSheetGuard(!made && (touched || draft.name.trim().length > 0));
  // Once the guard has let go, the spot's sheet opens in this one's place, and offers to describe
  // the spot and an alert there, as the web's panel of a spot just added.
  useEffect(() => {
    if (made) router.replace(newSpotHref(made));
  }, [made]);

  const spotsKey = orpc.v1.spots.list.queryKey();
  const create = useMutation(
    orpc.v1.spots.create.mutationOptions({
      onSuccess: async (spot) => {
        // The list on the screen changes at once; one that was on its way would bring it back
        // as it was, so it is dropped and asked for again.
        await queryClient.cancelQueries({ queryKey: spotsKey });
        queryClient.setQueryData(spotsKey, (answer) =>
          answer
            ? { spots: [...answer.spots.filter((one) => one.id !== spot.id), spot] }
            : { spots: [spot] },
        );
        void queryClient.invalidateQueries({ queryKey: spotsKey });
        tell({ title: m.spot_saved({ name: spot.name }), tone: "success" });
        // The map under the sheets goes where the spot is.
        moveMap({ point: spot, zoom: BREAK_ZOOM });
        setMade(spot.id);
      },
      // What was written stays: the sheet is still open on it.
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );
  const input = createInput(draft);
  function save() {
    if (!input || create.isPending) return;
    Keyboard.dismiss();
    create.mutate(input);
  }

  /**
   * Puts the marker at `point`, on what it names. A place found away from where the map is, by
   * the search or the phone, brings the map there, as close as `zoom`.
   */
  function putAt(point: MapPoint, on?: { breakId?: string; name?: string }, zoom?: number) {
    feel("select");
    setTouched(true);
    setDraft((current) => placedAt(current, point, on));
    if (zoom !== undefined) map.current?.focus(point, zoom);
  }
  function press({ kind, id, at: [longitude, latitude] }: MapPress) {
    const point = { latitude, longitude };
    if (kind !== "break") return putAt(point);
    const found = breaks.data?.breaks.find((one) => one.id === id);
    putAt(point, { breakId: id, name: found?.name });
  }
  function pick(found: Found) {
    search.onQueryChange("");
    Keyboard.dismiss();
    const breakId = found.kind === "break" ? found.id : undefined;
    putAt(
      { latitude: found.latitude, longitude: found.longitude },
      { breakId, name: found.name },
      SPOT_ZOOM,
    );
  }
  async function findMe() {
    const point = await locate({ precise: true });
    if (point) putAt(point, {}, SPOT_ZOOM);
  }

  if (!pending && !signedIn) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title={m.spot_new_title()} onCancel={() => router.back()} />
        <EmptyState
          icon={PinIcon}
          title={m.spot_new_title()}
          description={m.spot_sign_in_prompt()}
          action={{
            label: m.auth_sign_in(),
            onPress: () => requireAccount(m.auth_reason_add_spot(), () => {}),
          }}
        />
      </View>
    );
  }
  if ((spots.data?.length ?? 0) >= SPOTS_MOST && !made) {
    return (
      <View className="flex-1 bg-background">
        <SheetHeader title={m.spot_new_title()} onCancel={() => router.back()} />
        <EmptyState icon={PinIcon} title={m.spot_new_title()} description={m.spot_full()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SheetHeader
        title={m.spot_new_title()}
        onCancel={guard.cancel}
        onSave={save}
        canSave={input !== undefined}
        saving={create.isPending}
      />
      {/* The keyboard pushes up what is typed in: the map gives way to it. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
          <SearchField
            value={search.query}
            onChange={search.onQueryChange}
            label={m.spot_search_label()}
            placeholder={m.spot_search_placeholder()}
            pending={search.isPending}
            onSubmit={() => {
              const first = search.breaks[0] ?? search.places[0];
              if (first) pick(first);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </View>

        <View style={{ flex: 1, overflow: "hidden" }}>
          <StationMap
            ref={map}
            stations={[]}
            wind={[]}
            breaks={breaks.data?.breaks ?? []}
            spots={spots.data ?? []}
            selected={draft.breakId ? { kind: "break", id: draft.breakId } : undefined}
            layers={LAYERS}
            sea={undefined}
            seaTime={undefined}
            arrows={[]}
            userLocation={located}
            // Drawn once it was put: by a press, a place found or the press held that opened the
            // sheet.
            draft={draft.placed ? draft.point : null}
            onDraftMoved={(point) => putAt(point)}
            opening={opening.view}
            remembers={false}
            accessibilityLabel={m.native_spot_marker()}
            accessibilityHint={hint}
            accessibilityValue={draft.placed ? { text: writePoint(draft.point) } : undefined}
            accessibilityActions={HEADINGS.map((name) => ({
              name,
              label: HEADING_LABELS[name](),
            }))}
            onAccessibilityAction={(event) => {
              const heading = event.nativeEvent.actionName as Heading;
              if (bounds && HEADINGS.includes(heading)) {
                putAt(nudged(stepFrom(draft, bounds), bounds, heading));
              }
            }}
            onPress={press}
            onMapPress={([longitude, latitude]: LngLat) => putAt({ latitude, longitude })}
            onLongPress={([longitude, latitude]: LngLat) => putAt({ latitude, longitude })}
            onMoved={(state) => {
              if (state.bounds) setBounds(state.bounds);
            }}
          />
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", right: space.s, bottom: space.s }}
          >
            <IconButton
              icon={LocateIcon}
              variant="surface"
              label={m.native_spot_here()}
              selected={located !== null}
              loading={isLocating}
              onPress={() => void findMe()}
            />
          </View>

          {/* What the search finds stands over the map, until a place is chosen. */}
          {search.isSearching ? (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors["cte-canvas"] }]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ padding: space.m, gap: space.l }}
              >
                <FoundList search={search} onPick={pick} />
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>

        {/* While a place is searched for, the keyboard has the room of the form. */}
        {searchFocused ? null : (
          <View
            style={{
              gap: space.s,
              paddingHorizontal: space.m,
              paddingTop: space.s,
              paddingBottom: keyboardShown ? space.s : Math.max(insets.bottom, space.s),
            }}
          >
            <View style={{ gap: space.xxs }}>
              <Text size="s" tone="muted">
                {hint}
              </Text>
              {draft.placed ? (
                <Text size="xs" tone="muted" numeric>
                  {writePoint(draft.point)}
                </Text>
              ) : null}
            </View>

            {nearby.spot ? (
              <Nearby
                text={m.spot_near({ name: nearby.spot.name })}
                action={m.spot_near_open()}
                onPress={() => router.replace(placeHref("spot", nearby.spot!.id))}
              />
            ) : null}
            {nearby.break ? (
              <Nearby
                text={m.native_spot_near_break({ name: nearby.break.name })}
                action={m.native_spot_from_break()}
                onPress={() => {
                  const one = nearby.break!;
                  putAt(one, { breakId: one.id, name: one.name });
                }}
              />
            ) : null}

            <NameField
              value={draft.name}
              onChange={(name) => setDraft((current) => ({ ...current, name }))}
              onSubmit={save}
              disabled={create.isPending}
            />
            {/* Said before the spot is saved: nobody publishes a secret spot by accident. */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs }}>
              <View style={{ paddingTop: 2 }}>
                <Glyph icon={LockIcon} size={14} color={colors["neutral-7"]} />
              </View>
              <Text size="s" tone="muted" style={{ flex: 1 }}>
                {m.spot_private_hint()}
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/** What stands near the marker, with what goes to it. */
function Nearby({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  const { space } = useTheme();
  return (
    <Surface
      variant="muted"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingVertical: space.xs,
        paddingLeft: space.m,
        paddingRight: space.xs,
      }}
    >
      <Text size="s" style={{ flex: 1 }}>
        {text}
      </Text>
      <Button variant="secondary" onPress={onPress}>
        {action}
      </Button>
    </Surface>
  );
}

type NameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
};

/** The spot's name, on the surface of a grouped list, its label over it. */
function NameField({ value, onChange, onSubmit, disabled }: NameFieldProps) {
  const { colors, space, type, fonts } = useTheme();
  return (
    <View style={{ gap: space.xxs }}>
      <Text size="s" weight="medium" tone="muted" style={{ paddingHorizontal: space.m }}>
        {m.spot_name_label()}
      </Text>
      <Surface insetEdge style={{ paddingHorizontal: space.m }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={m.spot_name_label()}
          placeholder={m.spot_name_placeholder()}
          placeholderTextColor={colors["neutral-6"]}
          maxLength={NAME_MOST}
          editable={!disabled}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          enterKeyHint="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={onSubmit}
          selectionColor={colors["color-1"]}
          style={{
            minHeight: TARGET,
            paddingVertical: space.xs,
            color: colors["neutral-10"],
            fontFamily: fonts.regular,
            // As large as the platform's own field, which keeps iOS from zooming.
            fontSize: Math.max(type.m.size, 16),
          }}
        />
      </Surface>
    </View>
  );
}
