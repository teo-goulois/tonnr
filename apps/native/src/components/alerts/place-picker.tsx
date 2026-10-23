import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { Found } from "@/components/search/found";
import { FoundList, FoundMark } from "@/components/search/found-list";
import { SearchField } from "@/components/search/search-field";
import { usePlaceSearch } from "@/components/search/use-place-search";
import { type OfferedPlace, useOfferedPlaces } from "@/components/sessions/place-picker";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { PanelHeader, SheetRoot } from "@/components/ui/sheet";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { AlertPlace } from "./copies";

// Where a new alert goes, as the web's `AlertPlaceSheet` asks it: the drawer's head, "New alert"
// over its question, the field, then a spot of the account's own or a surf break looked at last,
// as plain rows under their names, or what the name typed finds (decision 064). The search is the
// map's (`usePlaceSearch`), with the breaks near the middle of the map first, and what was looked
// at last is the list in force of src/lib/recents.ts, as a session asks where it was. Decision 031.

/** A place found or offered, as an alert holds it: none that has no sheet, a buoy or a town. */
const asPlace = (found: Found | OfferedPlace): AlertPlace | undefined =>
  (found.kind === "spot" || found.kind === "break") && found.id
    ? {
        kind: found.kind,
        id: found.id,
        name: found.name,
        latitude: found.latitude,
        longitude: found.longitude,
      }
    : undefined;

/** A place offered, as the web's saved rows draw it: its small mark and its name. */
function OfferedRow({ place, onPress }: { place: AlertPlace; onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.name}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        // In line with the heading, its room laid outside it: the web's `-mx-xs px-xs`.
        marginHorizontal: -space.xs,
        paddingHorizontal: space.xs,
        borderRadius: radius.xs,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
      })}
    >
      <FoundMark kind={place.kind} small />
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {place.name}
      </Text>
    </Pressable>
  );
}

type PlacePickerProps = {
  /** The middle of the map: the breaks nearest it come first. */
  near?: { latitude: number; longitude: number; zoom?: number };
  onPick: (place: AlertPlace) => void;
  /** Leaves the sheet, by the cross of its head. */
  onClose: () => void;
};

export function PlacePicker({ near, onPick, onClose }: PlacePickerProps) {
  const { colors, space } = useTheme();
  const offered = useOfferedPlaces();
  // An alert is set on a break or a spot: no buoy, and no place without a sheet, is looked for.
  const search = usePlaceSearch({ near, spots: offered.spots, withPlaces: false });

  const pick = (place: AlertPlace) => {
    feel("select");
    onPick(place);
  };
  const groups = [
    { title: m.spots_title(), places: offered.spots },
    { title: m.recents_title(), places: offered.breaks },
  ].filter((group) => group.places.length > 0);

  // The head and the field stand over the scroll view, which SheetRoot keeps where the sheet
  // lays it out.
  return (
    <SheetRoot style={{ flex: 1, backgroundColor: colors["neutral-1"] }}>
      <PanelHeader title={m.alert_new()} description={m.create_alert_spot()} onClose={onClose} />
      <View style={{ paddingHorizontal: space.m, paddingTop: space.m }}>
        <SearchField
          value={search.query}
          onChange={search.onQueryChange}
          label={m.create_alert_spot()}
          placeholder={m.session_where_placeholder()}
          pending={search.isPending}
          autoFocus
        />
      </View>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        contentContainerStyle={{ gap: space.m, padding: space.m, paddingBottom: space.xxl }}
      >
        {search.isSearching ? (
          <FoundList
            search={search}
            onPick={(one) => {
              const place = asPlace(one);
              if (place) pick(place);
            }}
          />
        ) : offered.isPending ? (
          <Loading>
            <View style={{ gap: space.xxs }}>
              <Skeleton height={TARGET} />
              <Skeleton height={TARGET} />
            </View>
          </Loading>
        ) : (
          groups.map((group) => (
            <View key={group.title} style={{ gap: space.xs }}>
              <Text weight="medium" accessibilityRole="header">
                {group.title}
              </Text>
              <View style={{ gap: space.xxs }}>
                {group.places.map((offer) => {
                  const place = asPlace(offer);
                  return place ? (
                    <OfferedRow
                      key={`${place.kind}:${place.id}`}
                      place={place}
                      onPress={() => pick(place)}
                    />
                  ) : null;
                })}
              </View>
            </View>
          ))
        )}

        {search.isSearching ? null : (
          <View style={{ alignItems: "flex-start", gap: space.s }}>
            {!offered.isPending && groups.length === 0 ? (
              <Text size="s" tone="muted">
                {m.create_alert_hint()}
              </Text>
            ) : null}
            {/* The new spot's screen takes this sheet's place, as the web closes this step to
                add one: once saved, the spot's sheet takes its own and offers an alert there,
                with no alert asking where left under it. */}
            <Button variant="secondary" onPress={() => router.replace("/spot/new")}>
              {m.spot_add()}
            </Button>
          </View>
        )}
      </KeyboardAwareScrollView>
    </SheetRoot>
  );
}
