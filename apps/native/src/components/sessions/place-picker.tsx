import { readRecents, RECENTS_KEY } from "@repo/client/recents";
import type { SessionPlace } from "@repo/client/sessions/types";
import { fold } from "@repo/config/names";
import { PinIcon, SearchIcon, WaveIcon } from "@repo/ui/icon";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { TextInput, View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { Row, Section } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

// Where a session was: the account's own spots and the breaks it looked at last before a name is
// typed, then the spots and the breaks of that name, as the web's `SessionSheet` asks it with
// `PlaceSearch`. A name is read whatever its case and its marks. Decisions 040 and 043.

// How long typing must have stopped before the API is asked.
const ASK_WAIT_MS = 250;

/** A place a session may be at, with its point: what is offered before a name is typed. */
export type OfferedPlace = SessionPlace & { latitude: number; longitude: number };

/** What the device kept of what was looked at last, for an account the API has not answered yet. */
function deviceRecents() {
  try {
    const kept = localStorage.getItem(RECENTS_KEY);
    return readRecents(kept ? JSON.parse(kept) : null);
  } catch {
    return [];
  }
}

/** The account's own spots, then the breaks it looked at last: where a session most likely was. */
export function useOfferedPlaces() {
  const { signedIn } = useAccount();
  const spots = useQuery(
    orpc.v1.spots.list.queryOptions({
      enabled: signedIn,
      select: (answer) => answer.spots,
      retry: false,
    }),
  );
  const recents = useQuery(
    orpc.v1.preferences.getRecents.queryOptions({ enabled: signedIn, retry: false }),
  );
  return useMemo(() => {
    const own: OfferedPlace[] = (spots.data ?? []).map((spot) => ({
      kind: "spot",
      id: spot.id,
      name: spot.name,
      latitude: spot.latitude,
      longitude: spot.longitude,
    }));
    const looked: OfferedPlace[] = (recents.data ?? deviceRecents())
      .filter((recent) => recent.kind === "break")
      .map((recent) => ({
        kind: "break",
        id: recent.id,
        name: recent.name,
        latitude: recent.latitude,
        longitude: recent.longitude,
      }));
    return { spots: own, breaks: looked, isPending: spots.isLoading };
  }, [spots.data, spots.isLoading, recents.data]);
}

/** What is typed, once typing has stopped for a moment. */
function useSettled(text: string) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), ASK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
}

type PlacePickerProps = {
  onPick: (place: SessionPlace) => void;
  /** Where the phone stands, to bring forward the breaks near it. */
  near?: { latitude: number; longitude: number } | null;
};

export function PlacePicker({ onPick, near }: PlacePickerProps) {
  const { colors, space, radius, type } = useTheme();
  const offered = useOfferedPlaces();
  const [typed, setTyped] = useState("");
  const asked = useSettled(typed.trim());
  const isAsking = asked.length >= 2;

  const found = useQuery(
    orpc.v1.breaks.search.queryOptions({
      input: {
        q: asked,
        limit: 12,
        ...(near && { latitude: near.latitude, longitude: near.longitude }),
      },
      enabled: isAsking,
      // What the search before found stays until the next answer comes, as the web's does.
      placeholderData: keepPreviousData,
      retry: false,
    }),
  );
  const folded = fold(asked);
  const spots = isAsking
    ? offered.spots.filter((spot) => fold(spot.name).includes(folded))
    : offered.spots;
  const breaks: SessionPlace[] = isAsking
    ? (found.data?.breaks ?? []).map((one) => ({ kind: "break", id: one.id, name: one.name }))
    : offered.breaks;
  const nothing = isAsking && found.data !== undefined && spots.length === 0 && breaks.length === 0;

  const row = (place: SessionPlace) => (
    <Row
      key={`${place.kind}:${place.id}`}
      icon={place.kind === "spot" ? PinIcon : WaveIcon}
      title={place.name}
      chevron={false}
      onPress={() => onPick(place)}
    />
  );

  return (
    <View style={{ gap: space.l }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          minHeight: 44,
          paddingHorizontal: space.s,
          borderRadius: radius.xs,
          borderCurve: "continuous",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <Glyph icon={SearchIcon} size={16} color={colors["neutral-7"]} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={m.session_where()}
          placeholder={m.session_where_placeholder()}
          placeholderTextColor={colors["neutral-6"]}
          style={{
            flex: 1,
            paddingVertical: space.xs,
            color: colors["neutral-10"],
            fontSize: type.m.size,
          }}
        />
      </View>

      {offered.isPending && !isAsking ? (
        <View style={{ gap: space.s }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      ) : null}
      {spots.length > 0 ? <Section title={m.spots_title()}>{spots.map(row)}</Section> : null}
      {breaks.length > 0 ? (
        <Section title={isAsking ? m.break_title() : m.recents_title()}>{breaks.map(row)}</Section>
      ) : null}
      {nothing ? (
        <Text tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.search_empty()}
        </Text>
      ) : found.isError && isAsking ? (
        <Text tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.search_failed()}
        </Text>
      ) : !isAsking && !offered.isPending && spots.length === 0 && breaks.length === 0 ? (
        <Text tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.session_where_hint()}
        </Text>
      ) : null}
    </View>
  );
}
