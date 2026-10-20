import { PLACES_MOST } from "@repo/client/alerts/editing";
import { CheckIcon, CircleXIcon, MapPinIcon, PlusIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { Found } from "@/components/search/found";
import { FoundList, FoundMark, FoundRow } from "@/components/search/found-list";
import { SearchField } from "@/components/search/search-field";
import { usePlaceSearch } from "@/components/search/use-place-search";
import { type OfferedPlace, useOfferedPlaces } from "@/components/sessions/place-picker";
import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { AlertPlace } from "./copies";

// Where an alert goes, as the web's `AlertPlaceSheet` asks it: a spot of the account's own, or a
// surf break of the catalogue, found by its name or among those looked at last (decision 064).
// The search is the map's (`usePlaceSearch`), drawn as its sheet draws it, and what was looked at
// last is the list in force of src/lib/recents.ts, as a session asks where it was. It asks where a
// new alert goes before anything else, and later holds the alert's places: up to twelve, each
// taken out with a press, and others added from the same list. Decision 031.

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

const sameAs = (one: AlertPlace, other: AlertPlace) =>
  one.kind === other.kind && one.id === other.id;

/** A place in the alert's list: its mark, its name and where it lies, and what a press does. */
function ChoiceRow({
  place,
  where,
  label,
  end,
  selected,
  disabled = false,
  onPress,
}: {
  place: AlertPlace;
  where?: string | undefined;
  label?: string;
  end: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? (where ? `${place.name}, ${where}` : place.name)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
        backgroundColor: pressed ? colors["neutral-3"] : undefined,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <FoundMark kind={place.kind} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{place.name}</Text>
        {where ? (
          <Text size="s" tone="muted" numberOfLines={1}>
            {where}
          </Text>
        ) : null}
      </View>
      {end}
    </Pressable>
  );
}

type PlacePickerProps = {
  /** One place for a new alert, or the alert's places to change. */
  mode: "one" | "many";
  /** Where the alert is written from: the breaks nearest it come first. */
  near?: { latitude: number; longitude: number };
  /** The alert's places, with "many". */
  chosen?: AlertPlace[];
  /** Whether the alert holds as many places as it may. */
  isFull?: boolean;
  onPick: (place: AlertPlace) => void;
  onRemove?: (place: AlertPlace) => void;
  /** What stands over the list: the sheet's header. */
  header: ReactNode;
};

export function PlacePicker({
  mode,
  near,
  chosen = [],
  isFull = false,
  onPick,
  onRemove,
  header,
}: PlacePickerProps) {
  const { colors, space } = useTheme();
  const offered = useOfferedPlaces();
  // An alert is set on a break or a spot: no buoy, and no place without a sheet, is looked for.
  const search = usePlaceSearch({ near, spots: offered.spots, withPlaces: false });

  const isChosen = (place: AlertPlace) => chosen.some((one) => sameAs(one, place));
  const pick = (place: AlertPlace) => {
    feel("select");
    if (mode === "many" && isChosen(place)) onRemove?.(place);
    else onPick(place);
  };
  // A place offered or found, as a row: with "many", a check while the alert holds it, and a "+"
  // while it may take it.
  const row = (offer: Found | OfferedPlace) => {
    const place = asPlace(offer);
    if (!place) return null;
    const where = "where" in offer ? offer.where : undefined;
    if (mode === "one") {
      return (
        <FoundRow
          key={`${place.kind}:${place.id}`}
          found={{ kind: place.kind, name: place.name, where }}
          onPress={() => pick(place)}
        />
      );
    }
    const isIn = isChosen(place);
    return (
      <ChoiceRow
        key={`${place.kind}:${place.id}`}
        place={place}
        where={where}
        selected={isIn}
        disabled={isFull && !isIn}
        end={
          <Glyph
            icon={isIn ? CheckIcon : PlusIcon}
            size={18}
            color={isIn ? colors["color-1"] : isFull ? colors["neutral-5"] : colors["neutral-7"]}
          />
        }
        onPress={() => pick(place)}
      />
    );
  };
  const groups = [
    { title: m.spots_title(), places: offered.spots },
    { title: m.recents_title(), places: offered.breaks },
  ].filter((group) => group.places.length > 0);
  const found = [
    { title: m.spots_title(), places: search.spots },
    { title: m.map_breaks(), places: search.breaks },
  ].filter((group) => group.places.length > 0);

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
        <SearchField
          value={search.query}
          onChange={search.onQueryChange}
          label={mode === "one" ? m.create_alert_spot() : m.native_alert_place_add()}
          placeholder={m.session_where_placeholder()}
          pending={search.isPending}
          autoFocus={mode === "one"}
        />
      </View>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={space.l}
        contentContainerStyle={{
          gap: space.l,
          paddingHorizontal: space.m,
          paddingBottom: space.xxl,
        }}
      >
        {mode === "many" ? (
          <Section
            title={m.native_alert_label_places()}
            footer={
              chosen.length <= 1
                ? m.native_alert_place_last()
                : m.alert_spots_most({ count: PLACES_MOST })
            }
          >
            {chosen.map((place) => (
              <ChoiceRow
                key={`${place.kind}:${place.id}`}
                place={place}
                label={m.native_alert_place_remove({ name: place.name })}
                disabled={chosen.length <= 1}
                end={<Glyph icon={CircleXIcon} size={18} color={colors["neutral-7"]} />}
                onPress={() => {
                  feel("select");
                  onRemove?.(place);
                }}
              />
            ))}
          </Section>
        ) : null}

        {search.isSearching ? (
          mode === "one" ? (
            <FoundList
              search={search}
              onPick={(one) => {
                const place = asPlace(one);
                if (place) pick(place);
              }}
            />
          ) : search.isPending && found.length === 0 ? (
            <Loading>
              <View style={{ gap: space.s }}>
                <Skeleton height={TARGET} />
                <Skeleton height={TARGET} />
              </View>
            </Loading>
          ) : found.length === 0 ? (
            <Text tone="muted" style={{ paddingHorizontal: space.m }}>
              {search.isError ? m.search_failed() : m.search_empty()}
            </Text>
          ) : (
            found.map((group) => (
              <Section key={group.title} title={group.title}>
                {group.places.map(row)}
              </Section>
            ))
          )
        ) : offered.isPending ? (
          <Loading>
            <View style={{ gap: space.s }}>
              <Skeleton height={TARGET} />
              <Skeleton height={TARGET} />
            </View>
          </Loading>
        ) : groups.length === 0 ? (
          <Text tone="muted" style={{ paddingHorizontal: space.m }}>
            {m.create_alert_hint()}
          </Text>
        ) : (
          groups.map((group) => (
            <Section key={group.title} title={group.title}>
              {group.places.map(row)}
            </Section>
          ))
        )}

        {mode === "one" ? (
          <View style={{ alignItems: "flex-start" }}>
            <Button variant="secondary" icon={MapPinIcon} onPress={() => router.push("/spot/new")}>
              {m.spot_add()}
            </Button>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}
