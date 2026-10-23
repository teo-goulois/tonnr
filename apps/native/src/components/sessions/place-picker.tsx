import type { SessionPlace } from "@repo/client/sessions/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { spotsQuery } from "@/components/map/queries";
import { kindWord } from "@/components/saved/place-words";
import type { Found } from "@/components/search/found";
import { FoundList, FoundMark, SMALL_MARK } from "@/components/search/found-list";
import { SearchField } from "@/components/search/search-field";
import { usePlaceSearch } from "@/components/search/use-place-search";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRecentPlaces } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

// Where a session was: the account's own spots and the breaks it looked at last before a name is
// typed, then the spots and the breaks of that name, as the web's `SessionSheet` asks it with
// `PlaceSearch`. The search is the map's (`usePlaceSearch`), drawn as its sheet draws it, and what
// was looked at last is the list in force of src/lib/recents.ts. Decisions 040, 042 and 043.

/** A place a session may be at, with its point: what is offered before a name is typed. */
export type OfferedPlace = SessionPlace & { latitude: number; longitude: number };

/** The account's own spots, then the breaks it looked at last: where a session most likely was. */
export function useOfferedPlaces() {
  const { signedIn } = useAccount();
  const spots = useQuery(spotsQuery(signedIn));
  const { recents } = useRecentPlaces();
  return useMemo(() => {
    const own = (spots.data ?? []).map((spot): OfferedPlace => ({
      kind: "spot",
      id: spot.id,
      name: spot.name,
      latitude: spot.latitude,
      longitude: spot.longitude,
    }));
    const looked = recents.flatMap((recent): OfferedPlace[] =>
      recent.kind === "break"
        ? [
            {
              kind: "break",
              id: recent.id,
              name: recent.name,
              latitude: recent.latitude,
              longitude: recent.longitude,
            },
          ]
        : [],
    );
    return { spots: own, breaks: looked, isPending: spots.isLoading };
  }, [spots.data, spots.isLoading, recents]);
}

/** A place offered, as the saved tab's rows and the web's `SpotRow` and `BreakRow` draw it. */
function OfferedRow({ place, onPress }: { place: OfferedPlace; onPress: () => void }) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${kindWord(place.kind)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
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
  onPick: (place: SessionPlace) => void;
  /** Where the phone stands, to bring forward the breaks near it. */
  near?: { latitude: number; longitude: number } | null;
};

/**
 * The search, then, before a name is typed, the account's spots and the breaks it looked at last,
 * each under its title in the body's medium, on the sheet's own ground, as the web's `PlaceSearch`
 * lists them in the session's sheet. The search waits to be pressed, as the web's does: the places
 * offered stay in view under no keyboard.
 */
export function PlacePicker({ onPick, near }: PlacePickerProps) {
  const { space, type } = useTheme();
  const offered = useOfferedPlaces();
  // A session is at a break or at a spot: no buoy, and no place without a sheet, is looked for.
  const search = usePlaceSearch({
    near: near ?? undefined,
    spots: offered.spots,
    withPlaces: false,
  });

  const pick = (found: Found) => {
    if ((found.kind === "spot" || found.kind === "break") && found.id) {
      onPick({ kind: found.kind, id: found.id, name: found.name });
    }
  };
  const groups = [
    { title: m.spots_title(), places: offered.spots },
    { title: m.recents_title(), places: offered.breaks },
  ].filter((group) => group.places.length > 0);

  return (
    <View style={{ gap: space.m }}>
      <SearchField
        value={search.query}
        onChange={search.onQueryChange}
        label={m.session_where()}
        placeholder={m.session_where_placeholder()}
        pending={search.isPending}
      />
      {search.isSearching ? (
        <FoundList search={search} onPick={pick} />
      ) : offered.isPending ? (
        <Loading>
          <View style={{ gap: space.xxs }}>
            {[0.5, 0.35].map((width) => (
              <View
                key={width}
                style={{
                  minHeight: TARGET,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xs,
                }}
              >
                <Skeleton width={SMALL_MARK} height={SMALL_MARK} round />
                <Skeleton width={`${width * 100}%`} height={type.s.line} />
              </View>
            ))}
          </View>
        </Loading>
      ) : groups.length === 0 ? (
        <Text size="s" tone="muted">
          {m.session_where_hint()}
        </Text>
      ) : (
        groups.map((group) => (
          <View key={group.title} style={{ gap: space.xs }}>
            <Text weight="medium" accessibilityRole="header">
              {group.title}
            </Text>
            {/* The rows' room stands outside the list, so that their words line up with the title. */}
            <View style={{ gap: space.xxs, marginHorizontal: -space.xs }}>
              {group.places.map((place) => (
                <OfferedRow
                  key={`${place.kind}:${place.id}`}
                  place={place}
                  onPress={() => onPick(place)}
                />
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
