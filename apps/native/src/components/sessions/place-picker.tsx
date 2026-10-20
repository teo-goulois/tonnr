import type { SessionPlace } from "@repo/client/sessions/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { View } from "react-native";

import { spotsQuery } from "@/components/map/queries";
import type { Found } from "@/components/search/found";
import { FoundList, FoundRow } from "@/components/search/found-list";
import { SearchField } from "@/components/search/search-field";
import { usePlaceSearch } from "@/components/search/use-place-search";
import { Section } from "@/components/ui/list";
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

type PlacePickerProps = {
  onPick: (place: SessionPlace) => void;
  /** Where the phone stands, to bring forward the breaks near it. */
  near?: { latitude: number; longitude: number } | null;
};

export function PlacePicker({ onPick, near }: PlacePickerProps) {
  const { space } = useTheme();
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
    <View style={{ gap: space.l }}>
      <SearchField
        value={search.query}
        onChange={search.onQueryChange}
        label={m.session_where()}
        placeholder={m.session_where_placeholder()}
        pending={search.isPending}
        autoFocus
      />
      {search.isSearching ? (
        <FoundList search={search} onPick={pick} />
      ) : offered.isPending ? (
        <Loading>
          <View style={{ gap: space.s }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </View>
        </Loading>
      ) : groups.length === 0 ? (
        <Text tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.session_where_hint()}
        </Text>
      ) : (
        groups.map((group) => (
          <Section key={group.title} title={group.title}>
            {group.places.map((place) => (
              <FoundRow
                key={`${place.kind}:${place.id}`}
                found={place}
                onPress={() => onPick(place)}
              />
            ))}
          </Section>
        ))
      )}
    </View>
  );
}
