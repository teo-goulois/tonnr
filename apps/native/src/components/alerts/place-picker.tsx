import { PLACES_MOST } from "@repo/client/alerts/editing";
import { RECENTS_KEY, type Recent, readRecents } from "@repo/client/recents";
import type { Spot } from "@repo/client/viewer/types";
import { fold } from "@repo/config/names";
import { CheckIcon, CircleXIcon, MapPinIcon, PlusIcon, SearchIcon, WaveIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import type { AlertPlace } from "./copies";

// Where an alert goes, as the web's `AlertPlaceSheet` asks it: a spot of the account's own, or a
// surf break of the catalogue, found by its name or among those looked at last (decision 064).
// It asks where a new alert goes before anything else, and later holds the alert's places: up
// to twelve, each taken out with a press, and others added from the same list. Decision 031.

// How long the search waits after the last key, and from how many letters it asks.
const WAIT_MS = 250;
const SEARCH_FROM = 2;
const BREAKS_MOST = 8;
const MINUTE_MS = 60 * 1000;

// The nearest places first, as an address is read.
const whereOf = (location: string[] | null | undefined) =>
  [...(location ?? [])].reverse().slice(0, 3).join(", ") || undefined;

type Found = AlertPlace & { where?: string };

/** What the phone and the account looked at last: the breaks of it, the last first. */
function useRecentBreaks() {
  const { signedIn } = useAccount();
  const kept = useQuery(
    orpc.v1.preferences.getRecents.queryOptions({ enabled: signedIn, meta: { quiet: true } }),
  );
  return useMemo<Recent[]>(() => {
    let phone: Recent[] = [];
    try {
      phone = readRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "null"));
    } catch {
      // A phone that keeps nothing has looked at nothing.
    }
    const all = kept.data ? readRecents(kept.data) : phone;
    return all.filter((recent) => recent.kind === "break");
  }, [kept.data]);
}

/** The breaks of the catalogue and the account's spots whose name holds what is typed. */
function useFinder(
  spots: Spot[] | undefined,
  near: { latitude: number; longitude: number } | undefined,
) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAsked(query.trim()), WAIT_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const typed = query.trim();
  const searching = typed.length >= SEARCH_FROM;
  const breaks = useQuery(
    orpc.v1.breaks.search.queryOptions({
      input: {
        q: asked,
        ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}),
        limit: BREAKS_MOST,
      },
      enabled: asked.length >= SEARCH_FROM,
      placeholderData: (previous) => previous,
      staleTime: 10 * MINUTE_MS,
      meta: { quiet: true },
    }),
  );
  const read = searching ? fold(typed) : "";
  const ownSpots = useMemo<Found[]>(
    () =>
      read
        ? (spots ?? [])
            .filter((one) => fold(one.name).includes(read))
            .map((one) => ({ kind: "spot", ...pointOf(one) }))
        : [],
    [spots, read],
  );
  const foundBreaks = useMemo<Found[]>(
    () =>
      searching
        ? (breaks.data?.breaks ?? []).map((one) => ({
            kind: "break",
            id: one.id,
            name: one.name,
            latitude: one.latitude,
            longitude: one.longitude,
            where: whereOf(one.location),
          }))
        : [],
    [searching, breaks.data],
  );
  return {
    query,
    setQuery,
    searching,
    spots: ownSpots,
    breaks: foundBreaks,
    isPending: searching && (asked !== typed || breaks.isFetching),
    isError: searching && breaks.isError,
  };
}

const pointOf = (one: { id: string; name: string; latitude: number; longitude: number }) => ({
  id: one.id,
  name: one.name,
  latitude: one.latitude,
  longitude: one.longitude,
});

/** A row of a place: its sign, its name and where it is, and what a press does at its end. */
function PlaceRow({
  icon,
  name,
  where,
  end,
  onPress,
  accessibilityLabel,
  selected,
  disabled = false,
}: {
  icon: GlyphIcon;
  name: string;
  where?: string;
  end?: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { colors, space } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (where ? `${name}, ${where}` : name)}
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
      <Glyph icon={icon} size={18} color={colors["neutral-7"]} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{name}</Text>
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

/** Rows grouped on the theme's surface, under a title. */
function Group({ title, children }: { title?: string; children: ReactNode[] }) {
  const { space } = useTheme();
  if (children.length === 0) return null;
  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text
          size="s"
          weight="medium"
          tone="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: space.m }}
        >
          {title}
        </Text>
      ) : null}
      <Surface insetEdge style={{ overflow: "hidden" }}>
        {children.map((child, index) => (
          <View key={index}>
            {index > 0 ? <Separator inset={space.m + 18 + space.s} /> : null}
            {child}
          </View>
        ))}
      </Surface>
    </View>
  );
}

type PlacePickerProps = {
  /** One place for a new alert, or the alert's places to change. */
  mode: "one" | "many";
  spots: Spot[] | undefined;
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
  spots,
  near,
  chosen = [],
  isFull = false,
  onPick,
  onRemove,
  header,
}: PlacePickerProps) {
  const { colors, space, radius } = useTheme();
  const finder = useFinder(spots, near);
  const recents = useRecentBreaks();
  const isChosen = (place: AlertPlace) =>
    chosen.some((one) => one.kind === place.kind && one.id === place.id);
  const pick = (place: AlertPlace) => {
    feel("select");
    if (mode === "many" && isChosen(place)) onRemove?.(place);
    else onPick(place);
  };
  const end = (place: AlertPlace) =>
    mode === "one" ? null : isChosen(place) ? (
      <Glyph icon={CheckIcon} size={18} color={colors["color-1"]} />
    ) : (
      <Glyph icon={PlusIcon} size={18} color={isFull ? colors["neutral-5"] : colors["neutral-7"]} />
    );
  const row = (place: Found, icon: GlyphIcon) => (
    <PlaceRow
      key={`${place.kind}:${place.id}`}
      icon={icon}
      name={place.name}
      where={place.where}
      selected={mode === "many" ? isChosen(place) : undefined}
      disabled={mode === "many" && isFull && !isChosen(place)}
      end={end(place)}
      onPress={() => pick(place)}
    />
  );

  const ownSpots = (spots ?? []).map<Found>((one) => ({ kind: "spot", ...pointOf(one) }));
  const looked = recents.map<Found>((one) => ({ kind: "break", ...pointOf(one) }));

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.xs,
            minHeight: TARGET,
            paddingHorizontal: space.s,
            borderRadius: radius.xs,
            borderCurve: "continuous",
            backgroundColor: colors["neutral-3"],
          }}
        >
          <Glyph icon={SearchIcon} size={16} color={colors["neutral-7"]} />
          <TextInput
            value={finder.query}
            onChangeText={finder.setQuery}
            placeholder={m.session_where_placeholder()}
            placeholderTextColor={colors["neutral-6"]}
            accessibilityLabel={mode === "one" ? m.create_alert_spot() : m.native_alert_place_add()}
            autoFocus={mode === "one"}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            className="text-m font-normal text-neutral-10"
            style={{ flex: 1, paddingVertical: space.xs }}
          />
        </View>
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
          <View style={{ gap: space.xs }}>
            <Group title={m.native_alert_label_places()}>
              {chosen.map((place) => (
                <PlaceRow
                  key={`${place.kind}:${place.id}`}
                  icon={place.kind === "spot" ? MapPinIcon : WaveIcon}
                  name={place.name}
                  accessibilityLabel={m.native_alert_place_remove({ name: place.name })}
                  disabled={chosen.length <= 1}
                  end={<Glyph icon={CircleXIcon} size={18} color={colors["neutral-7"]} />}
                  onPress={() => {
                    feel("select");
                    onRemove?.(place);
                  }}
                />
              ))}
            </Group>
            <Text size="xs" tone="muted" style={{ paddingHorizontal: space.m }}>
              {chosen.length <= 1
                ? m.native_alert_place_last()
                : m.alert_spots_most({ count: PLACES_MOST })}
            </Text>
          </View>
        ) : null}

        {finder.searching ? (
          finder.isPending && finder.breaks.length === 0 && finder.spots.length === 0 ? (
            <Loading>
              <Surface style={{ padding: space.m, gap: space.s }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="45%" height={16} />
              </Surface>
            </Loading>
          ) : (
            <>
              <Group title={m.spots_title()}>
                {finder.spots.map((one) => row(one, MapPinIcon))}
              </Group>
              <Group title={m.native_alert_places_found()}>
                {finder.breaks.map((one) => row(one, WaveIcon))}
              </Group>
              {finder.isError ? (
                <Text size="s" tone="muted">
                  {m.alert_preview_failed()}
                </Text>
              ) : finder.breaks.length === 0 && finder.spots.length === 0 && !finder.isPending ? (
                <Text size="s" tone="muted">
                  {m.create_alert_hint()}
                </Text>
              ) : null}
            </>
          )
        ) : (
          <>
            <Group title={m.spots_title()}>{ownSpots.map((one) => row(one, MapPinIcon))}</Group>
            <Group title={m.recents_title()}>{looked.map((one) => row(one, WaveIcon))}</Group>
            {ownSpots.length === 0 && looked.length === 0 ? (
              <Text size="s" tone="muted">
                {m.create_alert_hint()}
              </Text>
            ) : null}
          </>
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
