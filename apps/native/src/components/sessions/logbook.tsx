import type { Month } from "@repo/client/sessions/rules";
import type { MediaItem, Session, SessionRecap } from "@repo/client/viewer/types";
import { Pressable, View } from "react-native";

import { placeHref } from "@/components/map/place-route";
import { TARGET } from "@/components/ui/metrics";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { RatingStars, ratingSaid } from "./rating";
import { openPlaceOnMap } from "./session-place";
import { RowList, SessionRow } from "./session-row";

// What an account's log comes to, and its sessions month by month, as the web's `LogbookPanel`
// draws them: this month and this year in two tiles of a fine line, the places surfed most with
// how they were rated, then every session, the latest first, each list's rows on the screen's own
// ground under a title in line with them. Decision 043.

const sessionsCount = (count: number) =>
  count === 1 ? m.sessions_count_one() : m.sessions_count({ count });

/** A figure of the recap: what it counts, how many sessions, and how long in the water. */
function Count({ name, count, minutes }: { name: string; count: number; minutes: number }) {
  const { space } = useTheme();
  const water = m.sessions_in_water({ duration: formatDuration(minutes) });
  return (
    <Surface
      variant="outline"
      radius="s"
      accessible
      accessibilityLabel={`${name}: ${sessionsCount(count)}, ${water}`}
      style={{ flex: 1, gap: space.xxs, padding: space.s }}
    >
      <Text size="s" tone="muted">
        {name}
      </Text>
      <Text size="l" weight="medium" numeric>
        {sessionsCount(count)}
      </Text>
      <Text size="s" tone="muted" numeric>
        {water}
      </Text>
    </Surface>
  );
}

/** A list's title, in line with the rows under it. */
function ListTitle({ children }: { children: string }) {
  return (
    <Text size="s" weight="medium" tone="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

type Place = SessionRecap["places"][number];

/** A place surfed often: its name, how it was rated, and how many times. A press opens it. */
function PlaceRow({ place }: { place: Place }) {
  const { colors, space, radius } = useTheme();
  const { spotId, breakId } = place;
  const href = spotId ? placeHref("spot", spotId) : breakId ? placeHref("break", breakId) : null;
  // What a screen reader hears, as it reads the web's row: the stars say the rating as it is.
  const said = [
    place.name,
    place.averageRating === null ? null : ratingSaid(place.averageRating),
    sessionsCount(place.count),
  ]
    .filter(Boolean)
    .join(", ");
  const body = (
    <>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {place.name}
      </Text>
      <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
        {/* How the sessions there were rated, to the nearest half star. */}
        <RatingStars rating={place.averageRating} />
        <Text size="s" tone="muted" numeric>
          {sessionsCount(place.count)}
        </Text>
      </View>
    </>
  );
  const shape = {
    minHeight: TARGET,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.xs,
    borderCurve: "continuous" as const,
  };
  // A place that is gone has its sessions, and nothing to open.
  if (!href) {
    return (
      <View accessible accessibilityLabel={said} style={shape}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={said}
      onPress={() => openPlaceOnMap(href)}
      style={({ pressed }) => [
        shape,
        pressed ? { backgroundColor: colors["neutral-3-transparent"] } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

/** What the log comes to: this month, this year, and the places surfed most. */
export function Recap({ recap }: { recap: SessionRecap }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.l }}>
      <View style={{ flexDirection: "row", gap: space.xs }}>
        <Count name={m.sessions_this_month()} {...recap.month} />
        <Count name={m.sessions_this_year()} {...recap.year} />
      </View>
      {recap.places.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <ListTitle>{m.sessions_places()}</ListTitle>
          <RowList>
            {recap.places.map((place) => (
              <PlaceRow key={place.spotId ?? place.breakId ?? place.name} place={place} />
            ))}
          </RowList>
        </View>
      ) : null}
    </View>
  );
}

/** A month of the log: its name, and its sessions under it. */
export function MonthGroup({
  month,
  now,
  media,
  onDelete,
}: {
  month: Month;
  now: number;
  media: Readonly<Record<string, MediaItem[]>>;
  onDelete: (session: Session) => void;
}) {
  const { space } = useTheme();
  const title = month.name.charAt(0).toUpperCase() + month.name.slice(1);
  return (
    <View style={{ gap: space.xs }}>
      <ListTitle>{title}</ListTitle>
      <RowList>
        {month.sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            now={now}
            withPlace
            media={media[session.id]}
            onDelete={onDelete}
            plain
          />
        ))}
      </RowList>
    </View>
  );
}
