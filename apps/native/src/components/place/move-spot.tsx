import type { Spot } from "@repo/client/viewer/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Keyboard, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";

import { AccountPrompt } from "@/components/auth/account-prompt";
import { DEFAULT_LAYERS } from "@/components/map/layers";
import { type Heading, NAME_MOST, nudged, writePoint } from "@/components/map/new-spot";
import { BREAK_LIMIT, MINUTE_MS, spotsQuery } from "@/components/map/queries";
import { StationMap } from "@/components/map/station-map";
import {
  bboxOf,
  type Bounds,
  type MapPoint,
  SPOT_ZOOM,
  visibleBounds,
} from "@/components/map/view";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useAppForm, useFormSend, useSelector } from "@/components/ui/form";
import { feel } from "@/components/ui/haptics";
import { useSheetGuard } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { PlaceHeader } from "./place-header";
import { type PlaceRecord, usePlaceRecord } from "./use-place";
import { useSpotActions } from "./use-spot";

// Renaming a spot of the account's own and moving it, in one sheet, as the web's `SpotEditor`
// does both in the spot's own drawer, with the marker of `NewSpotPanel`. The sheet keeps the
// spot's head, its name, what it says of its privacy, and the cross. Under the map: its name in
// the kit's field, where the marker stands, then Save and Cancel at their own width. The marker
// is the new spot's: a finger drags it, a press on the map brings it to the point pressed, and a
// screen reader moves it a step at a time. The spot itself is drawn by its marker alone while it
// moves. Saved, the name and the point go together; while they are saved, the marker stays where
// it is. A name left empty is said under its field once sent, which takes the focus, as the web
// says it (decisions 076 and 078). Cancel, the cross, a swipe or the back of Android ask before a
// spot renamed or moved is left as it was. A spot that is gone, or not the account's, is said
// so. Decision 006.

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

/** What a spot's name must be, said in the reader's language: the sheet that adds one says it too. */
export const spotNameSchema = () => z.string().trim().min(1, m.spot_name_missing());

/**
 * The form of a spot's name, which the new spot's sheet holds too: it says nothing before it is
 * sent, and `onSave` is given the name trimmed.
 */
export function useSpotNameForm(name: string, onSave: (name: string) => void) {
  return useAppForm({
    defaultValues: { name },
    validators: { onSubmit: z.object({ name: spotNameSchema() }) },
    onSubmit: ({ value }) => onSave(value.name.trim()),
  });
}

export type SpotNameForm = ReturnType<typeof useSpotNameForm>;

export function MoveSpot({ id }: { id: string }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const { signedIn } = useAccount();
  const record = usePlaceRecord("spot", id);
  // A spot's head reads the hour only for a station: one moment does for the sheet.
  const [now] = useState(() => Date.now());
  // Nothing is written until the spot is in hand: until then the sheet closes without asking.
  const { cancel } = useSheetGuard(false);

  // The editor opens on a spot of the account's own, once it is read, as the web's does.
  if (record.spot && record.isOwner) {
    return <SpotEditor record={record} spot={record.spot} now={now} />;
  }
  const gone = record.isError || record.spot !== undefined;
  return (
    <View className="flex-1 bg-background">
      <PlaceHeader record={record} now={now} isSaved={false} saveLabel="" onClose={cancel} />
      {gone ? (
        <View style={{ padding: space.m, paddingBottom: insets.bottom + space.m }}>
          {signedIn ? (
            <ErrorState plain title={m.spot_not_found()} />
          ) : (
            <AccountPrompt text={m.spot_sign_in_prompt()} />
          )}
        </View>
      ) : (
        <View style={{ flex: 1, padding: space.m }}>
          <Loading>
            <Skeleton height={320} />
          </Loading>
        </View>
      )}
    </View>
  );
}

function SpotEditor({ record, spot, now }: { record: PlaceRecord; spot: Spot; now: number }) {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardState((state) => state.isVisible);
  const { signedIn } = useAccount();
  const actions = useSpotActions();
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
  const form = useSpotNameForm(spot.name, (name) => {
    if (actions.isChanging) return;
    Keyboard.dismiss();
    actions.edit(spot, { name, latitude: at.latitude, longitude: at.longitude }, guard.close);
  });
  const renamed = useSelector(form.store, (state) => state.values.name.trim() !== spot.name);
  const moved =
    point !== undefined &&
    (Math.abs(point.latitude - spot.latitude) > 1e-6 ||
      Math.abs(point.longitude - spot.longitude) > 1e-6);
  const guard = useSheetGuard((renamed || moved) && !actions.isChanging);

  /** Puts the marker at `next`, where the map shows it already. */
  function putAt(next: MapPoint) {
    // It stays where it is while the spot is being saved, as the web's marker does.
    if (actions.isChanging) return;
    feel("select");
    setPoint(next);
  }

  return (
    <View className="flex-1 bg-background">
      <form.AppForm>
        <PlaceHeader
          record={record}
          now={now}
          isSaved={false}
          saveLabel=""
          onClose={guard.cancel}
        />
        {/* The keyboard pushes up what is typed in: the map gives way to it. */}
        <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
          <View style={{ flex: 1, overflow: "hidden", marginTop: space.s }}>
            <StationMap
              stations={[]}
              wind={[]}
              breaks={breaks.data?.breaks ?? []}
              spots={(spots.data ?? []).filter((one) => one.id !== spot.id)}
              selected={undefined}
              layers={LAYERS}
              sea={undefined}
              seaTime={undefined}
              arrows={[]}
              userLocation={null}
              draft={at}
              onDraftMoved={putAt}
              opening={{ center: [spot.longitude, spot.latitude], zoom: SPOT_ZOOM }}
              remembers={false}
              accessibilityLabel={m.native_spot_marker()}
              accessibilityHint={m.spot_marker_hint()}
              accessibilityValue={{ text: writePoint(at) }}
              accessibilityActions={HEADINGS.map((heading) => ({
                name: heading,
                label: HEADING_LABELS[heading](),
              }))}
              onAccessibilityAction={(event) => {
                const heading = event.nativeEvent.actionName as Heading;
                if (bounds && HEADINGS.includes(heading)) {
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
          <View
            style={{
              paddingHorizontal: space.m,
              paddingTop: space.m,
              paddingBottom: keyboardShown ? space.s : Math.max(insets.bottom, space.s),
            }}
          >
            <SpotEditorFields
              form={form}
              at={at}
              isSaving={actions.isChanging}
              onCancel={guard.cancel}
            />
          </View>
        </KeyboardAvoidingView>
      </form.AppForm>
    </View>
  );
}

/**
 * The web's editor under the map: the name, where the marker stands, then Save and Cancel at
 * their own width. The field's return key sends the form as Save does.
 */
function SpotEditorFields({
  form,
  at,
  isSaving,
  onCancel,
}: {
  form: SpotNameForm;
  at: MapPoint;
  isSaving: boolean;
  onCancel: () => void;
}) {
  const { space } = useTheme();
  const send = useFormSend();
  return (
    <View style={{ gap: space.m }}>
      <form.AppField name="name">
        {(field) => (
          <field.Input
            label={m.spot_name_label()}
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
      <View style={{ gap: space.xxs }}>
        <Text size="s" tone="muted">
          {m.spot_marker_hint()}
        </Text>
        <Text size="xs" tone="muted" numeric>
          {writePoint(at)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <form.SubmitButton pending={isSaving}>{m.spot_edit_save()}</form.SubmitButton>
        <Button variant="ghost" disabled={isSaving} onPress={onCancel}>
          {m.action_cancel()}
        </Button>
      </View>
    </View>
  );
}
