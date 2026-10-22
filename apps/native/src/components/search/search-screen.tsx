import type { Recent } from "@repo/client/recents";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { currentMapState, moveMap } from "@/components/map/map-state";
import { giveToSheet } from "@/components/map/open-place";
import { placeHref } from "@/components/map/place-route";
import { spotsQuery, wavesQuery } from "@/components/map/queries";
import { middleOf, PLACE_ZOOM } from "@/components/map/view";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRecentPlaces } from "@/lib/recents";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { Found } from "./found";
import { FoundList, FoundRow } from "./found-list";
import { SearchField } from "./search-field";
import { usePlaceSearch } from "./use-place-search";

// Finding a place by its name (decisions 030 and 040): a sheet as tall as a sheet goes, whose
// field takes the focus with its keyboard and stays in place over what scrolls. Before a key is
// pressed it lists what was looked at last. It finds the account's own spots, the breaks of the
// catalogue, the buoys and, for an account, the places a search service names: a place has no
// sheet of its own, and the map goes there; anything else opens its sheet in place of this one,
// as a press on its marker opens it, and the map brings it into view if it is not, at the zoom the
// map is at, as the web's search selects what it found.

export function SearchScreen() {
  const { space } = useTheme();
  const { signedIn } = useAccount();
  const spots = useQuery(spotsQuery(signedIn));
  const stations = useQuery(wavesQuery());
  const { recents, onClear } = useRecentPlaces();
  // What is near the middle of the map comes first, from where the map was as the search opened.
  const near = useMemo(() => {
    const state = currentMapState();
    return (
      middleOf(state.bounds) ?? {
        latitude: state.center[1],
        longitude: state.center[0],
        zoom: Math.round(state.zoom),
      }
    );
  }, []);
  const search = usePlaceSearch({
    near,
    spots: spots.data,
    stations: stations.data,
    withPlaces: signedIn,
  });

  function pick(found: Pick<Found, "kind" | "id" | "latitude" | "longitude">) {
    feel("select");
    if (found.kind === "place" || !found.id) {
      const point = { latitude: found.latitude, longitude: found.longitude };
      moveMap({ point, zoom: PLACE_ZOOM });
      router.back();
      return;
    }
    // The sheet of a place that is open under the search is given the place, as the web's one
    // panel is, and the search closes; or a sheet takes the search's place.
    const href = placeHref(found.kind, found.id);
    if (!giveToSheet(href)) router.replace(href);
  }

  return (
    <View className="flex-1 bg-background">
      {/* The field stays in place over what scrolls, with the way out beside it. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingTop: space.l,
          paddingBottom: space.s,
          paddingHorizontal: space.m,
        }}
      >
        <View style={{ flex: 1 }}>
          <SearchField
            value={search.query}
            onChange={search.onQueryChange}
            label={m.search_title()}
            placeholder={m.search_placeholder()}
            pending={search.isPending}
            autoFocus
          />
        </View>
        <Button variant="ghost" onPress={() => router.back()}>
          {m.action_cancel()}
        </Button>
      </View>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          gap: space.l,
          paddingHorizontal: space.m,
          paddingTop: space.xs,
          paddingBottom: space.xxl,
        }}
      >
        {search.isSearching ? (
          <FoundList search={search} onPick={pick} />
        ) : recents.length > 0 ? (
          <Recents recents={recents} onPick={pick} onClear={onClear} />
        ) : (
          <Text tone="muted" style={{ paddingHorizontal: space.m }}>
            {m.search_hint()}
          </Text>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** What was looked at last, a press away, and what forgets it (decision 042). */
function Recents({
  recents,
  onPick,
  onClear,
}: {
  recents: readonly Recent[];
  onPick: (found: Pick<Found, "kind" | "id" | "latitude" | "longitude">) => void;
  onClear: () => void;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: space.m,
        }}
      >
        <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
          {m.recents_title()}
        </Text>
        <Button variant="ghost" onPress={onClear}>
          {m.recents_clear()}
        </Button>
      </View>
      <Section>
        {recents.map((recent) => (
          <FoundRow
            key={`${recent.kind} ${recent.id}`}
            found={{ kind: recent.kind, name: recent.name }}
            onPress={() => onPick(recent)}
          />
        ))}
      </Section>
    </View>
  );
}
