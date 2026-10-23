import { LocateIcon, LockIcon, PinIcon, WaveIcon } from "@repo/ui/icon";
import {
  keepPreviousData,
  type QueryCache,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { type SpotNameForm, useSpotNameForm } from "@/components/place/move-spot";
import { type Found, keyOf } from "@/components/search/found";
import { SearchField } from "@/components/search/search-field";
import { type PlaceSearching, usePlaceSearch } from "@/components/search/use-place-search";
import { Glyph } from "@/components/shared/glyph";
import { Button, IconButton } from "@/components/ui/button";
import { useFormSend } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { PanelHeader, useSheetGuard } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
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
import { giveToSheet } from "./open-place";
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
// naming it, in that order, as the web's `NewSpotPanel` does it, in a sheet of the platform's
// with the head of the web's drawer. A press on the map puts the marker there, a finger drags it
// from there, and a press on a surf break puts it on the break, which the spot is then made from.
// The search finds the breaks and the places by their name, in the web's field, and the phone
// says where the reader is. Until the marker is put, the sheet holds the search and what else
// puts it; then the web's form: where the marker stands, a spot of the account's within 150
// metres with what opens it, the name, and what saves it, which is never greyed to stop a spot
// with no name: the name says under itself that it is missing (decisions 076 and 078). While the
// spot is saved, the search and the marker stay as they are.
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
  const tell = useTell();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardState((state) => state.isVisible);
  const params = useLocalSearchParams<{ latitude?: string; longitude?: string }>();
  const [opening] = useState(() => openingOf(params.latitude, params.longitude));
  const [draft, setDraft] = useState(opening.draft);
  // Whether the person did anything here that leaving would lose.
  const [touched, setTouched] = useState(false);
  // The spot whose sheet takes this one's place: the one just saved, whose sheet then offers to
  // describe it and to set an alert there, or one of the account's beside the marker that the
  // person chose to open.
  const [goingTo, setGoingTo] = useState<{ id: string; made: boolean }>();
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
  const placesFailed = usePlacesFailed(search.query.trim(), search.isSearching && signedIn);
  const near = nearOf(draft, spots.data);

  // What the search came to, as the web's panel says it under its field: the places not
  // answering, even beside the breaks found, or nothing found, both of which send the person to
  // the map, which still takes the marker. What it found is said to a screen reader alone.
  const found = search.breaks.length + search.places.length;
  const searched = search.isSearching && !search.isPending;
  const unavailable = searched && placesFailed;
  const empty = searched && found === 0 && !unavailable;
  const searchSaid = !searched
    ? undefined
    : unavailable
      ? m.spot_search_unavailable()
      : empty
        ? m.spot_search_empty()
        : m.native_search_count({ count: found });
  useEffect(() => {
    if (searchSaid) AccessibilityInfo.announceForAccessibility(searchSaid);
  }, [searchSaid]);

  // A spot of the account's near the marker is said to who cannot see it, as it changes.
  const nearSaid = near ? m.spot_near({ name: near.name }) : "";
  useEffect(() => {
    if (nearSaid) AccessibilityInfo.announceForAccessibility(nearSaid);
  }, [nearSaid]);

  // What to do with the marker, as the web says it: where to put it until it is put somewhere, then
  // how to move it.
  const hint = draft.placed ? m.spot_marker_hint() : m.spot_place_hint();

  const guard = useSheetGuard(!goingTo && (touched || draft.name.trim().length > 0));
  // Once the guard has let go, the spot's sheet opens in this one's place: a spot just added
  // offers to describe it and an alert there, as the web's panel of a spot just added.
  useEffect(() => {
    if (!goingTo) return;
    const href = goingTo.made ? newSpotHref(goingTo.id) : placeHref("spot", goingTo.id);
    // A place's sheet open under this one takes the spot instead, as a place has one sheet
    // (`open-place.ts`).
    if (!giveToSheet(href)) router.replace(href);
  }, [goingTo]);

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
        setGoingTo({ id: spot.id, made: true });
      },
      // What was written stays: the sheet is still open on it.
      onError: (error) => tell({ title: error.message, tone: "danger" }),
    }),
  );
  /** Saves the spot with the name its form sent, which the form's schema says is not empty. */
  function save(name: string) {
    const input = createInput({ ...draft, name });
    if (!input || create.isPending) return;
    Keyboard.dismiss();
    create.mutate(input);
  }

  /**
   * Puts the marker at `point`, on what it names. A place found away from where the map is, by
   * the search or the phone, brings the map there, as close as `zoom`.
   */
  function putAt(point: MapPoint, on?: { breakId?: string; name?: string }, zoom?: number) {
    // It stays where it is while the spot is being saved, as the web's marker does.
    if (create.isPending) return;
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
        <PanelHeader title={m.spot_new_title()} onClose={guard.cancel} />
        <View style={{ padding: space.m }}>
          {/* Once signed in, the sign-in sheet goes back to this one, which then holds the form. */}
          <AccountPrompt text={m.spot_sign_in_prompt()} />
        </View>
      </View>
    );
  }
  if ((spots.data?.length ?? 0) >= SPOTS_MOST && !goingTo) {
    return (
      <View className="flex-1 bg-background">
        <PanelHeader title={m.spot_new_title()} onClose={guard.cancel} />
        <View style={{ padding: space.m }}>
          <Text tone="muted">{m.spot_full()}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <PanelHeader title={m.spot_new_title()} onClose={guard.cancel} />
      {/* The keyboard pushes up what is typed in: the map gives way to it. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        <View
          style={{
            gap: space.xs,
            paddingHorizontal: space.m,
            paddingTop: space.m,
            paddingBottom: space.s,
          }}
        >
          <SearchField
            variant="outlined"
            value={search.query}
            onChange={search.onQueryChange}
            label={m.spot_search_label()}
            placeholder={m.spot_search_placeholder()}
            pending={search.isPending}
            disabled={create.isPending}
            onSubmit={() => {
              const first = search.breaks[0] ?? search.places[0];
              if (first) pick(first);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {unavailable || empty ? (
            <Text size="s" tone="muted">
              {searchSaid}
            </Text>
          ) : null}
          {/* The search's other way, as the web says it under its field until the marker is put. */}
          {draft.placed ? null : (
            <Text size="s" tone="muted">
              {m.spot_place_hint()}
            </Text>
          )}
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

          {/* What the search finds stands over the map, as the web lists it under its field,
              until a place is chosen. Until the first answer, the spinner in the field says it is
              on its way, and the map stays in view, which nothing found leaves to the marker. */}
          {search.isSearching && found > 0 ? (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors["cte-canvas"] }]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingHorizontal: space.m, paddingBottom: space.m }}
              >
                <FoundPlaces search={search} onPick={pick} />
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>

        {/* While a place is searched for, the keyboard has the room of the form, which stands
            under the map once the marker is put. Until then, the map's button stays clear of
            the bottom of the phone. */}
        {searchFocused ? null : draft.placed ? (
          <View
            style={{
              paddingHorizontal: space.m,
              paddingTop: space.m,
              paddingBottom: keyboardShown ? space.s : Math.max(insets.bottom, space.s),
            }}
          >
            <NewSpotForm
              draft={draft}
              onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
              near={near}
              onOpenSpot={(id) => setGoingTo({ id, made: false })}
              isSaving={create.isPending}
              onSave={save}
            />
          </View>
        ) : (
          <View style={{ height: keyboardShown ? 0 : insets.bottom }} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

type NewSpotFormProps = {
  draft: SpotDraft;
  // The name as it is typed: the draft keeps it with the marker.
  onNameChange: (name: string) => void;
  // A spot the account already has where the marker stands.
  near: { id: string; name: string } | undefined;
  // Opens that spot in this sheet's place, which the person chose: nothing is asked first.
  onOpenSpot: (id: string) => void;
  isSaving: boolean;
  onSave: (name: string) => void;
};

/**
 * Naming the spot once its marker is down, and saving it, as the web's `NewSpotForm`: where the
 * marker stands, a spot of the account's beside it, the name, then what saves it at the form's
 * width with what is said of a spot's privacy under it. The form holds the name as it is typed
 * and tells the draft, which keeps it with the marker: a place found or pressed on the map gives
 * the draft a name of its own until the person writes one, and the field follows it.
 */
function NewSpotForm({
  draft,
  onNameChange,
  near,
  onOpenSpot,
  isSaving,
  onSave,
}: NewSpotFormProps) {
  const form = useSpotNameForm(draft.name, (name) => {
    if (!isSaving) onSave(name);
  });
  // The name the draft was given by what the marker was put on. It is not what the person
  // typed: the field is not marked as changed, and the draft is not told again.
  useEffect(() => {
    if (form.getFieldValue("name") !== draft.name) {
      form.setFieldValue("name", draft.name, { dontUpdateMeta: true, dontRunListeners: true });
    }
  }, [form, draft.name]);

  return (
    <form.AppForm>
      <NewSpotFields
        form={form}
        point={draft.point}
        onNameChange={onNameChange}
        near={near}
        onOpenSpot={onOpenSpot}
        isSaving={isSaving}
      />
    </form.AppForm>
  );
}

/** The parts of the new spot's form, which its field's return key sends as its button does. */
function NewSpotFields({
  form,
  point,
  onNameChange,
  near,
  onOpenSpot,
  isSaving,
}: Omit<NewSpotFormProps, "draft" | "onSave"> & { form: SpotNameForm; point: MapPoint }) {
  const { colors, space, type } = useTheme();
  const send = useFormSend();
  return (
    <View style={{ gap: space.m }}>
      <View style={{ gap: space.xxs }}>
        <Text size="s" tone="muted">
          {m.spot_marker_hint()}
        </Text>
        <Text size="xs" tone="muted" numeric>
          {writePoint(point)}
        </Text>
      </View>

      {near ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}
        >
          <Text size="s">{m.spot_near({ name: near.name })}</Text>
          <Button variant="outline" onPress={() => onOpenSpot(near.id)}>
            {m.spot_near_open()}
          </Button>
        </View>
      ) : null}

      <form.AppField name="name" listeners={{ onChange: ({ value }) => onNameChange(value) }}>
        {(field) => (
          <field.Input
            label={m.spot_name_label()}
            placeholder={m.spot_name_placeholder()}
            maxLength={NAME_MOST}
            editable={!isSaving}
            autoComplete="off"
            autoCorrect={false}
            returnKeyType="done"
            // The keyboard stays while a name left empty is said under the field.
            submitBehavior="submit"
            onSubmitEditing={() => void send()}
          />
        )}
      </form.AppField>

      <View style={{ gap: space.xs }}>
        <form.SubmitButton fill pending={isSaving}>
          {m.spot_save()}
        </form.SubmitButton>
        {/* Said before the spot is saved: nobody publishes a secret spot by accident. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs }}>
          <View style={{ paddingTop: (type.s.line - LOCK) / 2 }}>
            <Glyph icon={LockIcon} size={LOCK} color={colors["neutral-7"]} />
          </View>
          <Text size="s" tone="muted" style={{ flex: 1 }}>
            {m.spot_private_hint()}
          </Text>
        </View>
      </View>
    </View>
  );
}

// The lock beside the private line, the web's `size-3.5`.
const LOCK = 14;
// The mark of a place found, the web's `size-6` with a glyph of `size-3.5`.
const FOUND_MARK = 24;
const FOUND_GLYPH = 14;

/**
 * Whether the places the search asked for what is typed could not be had. They are a service's
 * that is not the instance's (decision 030), and the web says so under what else was found, since
 * the map still takes the marker. The search keeps no word of it, so it is read where the search
 * keeps its answers.
 */
function usePlacesFailed(typed: string, asked: boolean) {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((changed: () => void) => cache.subscribe(changed), [cache]);
  return useSyncExternalStore(subscribe, () => asked && lastPlacesFailed(cache, typed));
}

/** Whether the last answer kept for places named `q`, wherever the map was, was a failure. */
function lastPlacesFailed(cache: QueryCache, q: string) {
  const kept = cache.findAll({
    queryKey: orpc.v1.places.search.key({ type: "query", input: { q } }),
  });
  const answeredAt = (query: (typeof kept)[number]) =>
    Math.max(query.state.dataUpdatedAt, query.state.errorUpdatedAt);
  const last = kept.reduce<(typeof kept)[number] | undefined>(
    (latest, query) => (!latest || answeredAt(query) > answeredAt(latest) ? query : latest),
    undefined,
  );
  return last?.state.status === "error";
}

/**
 * What the search found, as the web's new spot's panel lists it under its field: the breaks of
 * the catalogue, then the places by their name, each under a small title, as rows on the sheet's
 * ground with a small grey mark, the first in the grey of the one the search key takes, and whose
 * the places are under them.
 */
function FoundPlaces({
  search,
  onPick,
}: {
  search: PlaceSearching;
  onPick: (found: Found) => void;
}) {
  const { space } = useTheme();
  const groups = [
    { kind: "break" as const, label: m.map_breaks(), items: search.breaks },
    { kind: "place" as const, label: m.spot_search_places(), items: search.places },
  ].filter((group) => group.items.length > 0);
  const first = groups[0]?.items[0];

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ paddingVertical: space.xxs }}>
        {groups.map((group) => (
          <View key={group.kind}>
            <Text
              size="xs"
              weight="medium"
              tone="muted"
              accessibilityRole="header"
              style={{ paddingHorizontal: space.xs, paddingVertical: 6 }}
            >
              {group.label}
            </Text>
            {group.items.map((one) => (
              <FoundPlaceRow
                key={keyOf(one)}
                found={one}
                first={one === first}
                onPress={() => onPick(one)}
              />
            ))}
          </View>
        ))}
      </View>
      {search.places.length > 0 && search.credit ? (
        <Text size="xs" tone="muted">
          {m.spot_search_credit({ credit: search.credit })}
        </Text>
      ) : null}
    </View>
  );
}

/** A place found: its mark, its name, and where it lies under it. */
function FoundPlaceRow({
  found,
  first,
  onPress,
}: {
  found: Found;
  first: boolean;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={found.where ? `${found.name}, ${found.where}` : found.name}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.xs,
        paddingVertical: space.xxs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: pressed || first ? colors["neutral-3"] : undefined,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: FOUND_MARK,
          height: FOUND_MARK,
          borderRadius: FOUND_MARK / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <Glyph
          icon={found.kind === "break" ? WaveIcon : PinIcon}
          size={FOUND_GLYPH}
          color={colors["neutral-10"]}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{found.name}</Text>
        {found.where ? (
          <Text size="xs" tone="muted" numberOfLines={1}>
            {found.where}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
