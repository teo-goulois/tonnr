import type { Month } from "@repo/client/sessions/rules";
import type { MediaItem, Session, SessionRecap } from "@repo/client/viewer/types";
import { ChevronRightIcon } from "@repo/ui/icon";
import { Fragment } from "react";
import { Pressable, View } from "react-native";

import { placeHref } from "@/components/map/place-route";
import { Glyph } from "@/components/shared/glyph";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { RatingStars, ratingSaid } from "./rating";
import { openPlaceOnMap } from "./session-place";
import { SessionRow } from "./session-row";

// What an account's log comes to, and its sessions month by month, as the web's `LogbookPanel`
// shows them: this month and this year, the places surfed most with how they were rated, then
// every session, the latest first. Decision 043.

const sessionsCount = (count: number) =>
  count === 1 ? m.sessions_count_one() : m.sessions_count({ count });

/** A figure of the recap: what it counts, how many sessions, and how long in the water. */
function Count({ name, count, minutes }: { name: string; count: number; minutes: number }) {
  const { space } = useTheme();
  const water = m.sessions_in_water({ duration: formatDuration(minutes) });
  return (
    <Surface
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

type Place = SessionRecap["places"][number];

/** A place surfed often: its name, how it was rated, and how many times. A press opens it. */
function PlaceRow({ place }: { place: Place }) {
  const { colors, space } = useTheme();
  const { spotId, breakId } = place;
  const href = spotId ? placeHref("spot", spotId) : breakId ? placeHref("break", breakId) : null;
  const said = [
    place.name,
    place.averageRating === null ? null : ratingSaid(Math.round(place.averageRating * 2) / 2),
    sessionsCount(place.count),
  ]
    .filter(Boolean)
    .join(", ");
  const body = (
    <>
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {place.name}
      </Text>
      <RatingStars rating={place.averageRating} />
      <Text size="s" tone="muted" numeric>
        {sessionsCount(place.count)}
      </Text>
      {href ? <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} /> : null}
    </>
  );
  const shape = {
    minHeight: 48,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.xs,
    paddingHorizontal: space.m,
    paddingVertical: space.xs,
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
      style={({ pressed }) => [shape, pressed ? { backgroundColor: colors["neutral-3"] } : null]}
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
          <Text
            size="s"
            weight="medium"
            tone="muted"
            accessibilityRole="header"
            style={{ paddingHorizontal: space.m }}
          >
            {m.sessions_places()}
          </Text>
          <Surface insetEdge style={{ overflow: "hidden" }}>
            {recap.places.map((place, index) => (
              <Fragment key={place.spotId ?? place.breakId ?? place.name}>
                {index > 0 ? <Separator inset={space.m} /> : null}
                <PlaceRow place={place} />
              </Fragment>
            ))}
          </Surface>
        </View>
      ) : null}
    </View>
  );
}

/** A month of the log: its name, and its sessions on the lines of one group. */
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
      <Text
        size="s"
        weight="medium"
        tone="muted"
        accessibilityRole="header"
        style={{ paddingHorizontal: space.m }}
      >
        {title}
      </Text>
      <Surface insetEdge style={{ overflow: "hidden" }}>
        {month.sessions.map((session, index) => (
          <Fragment key={session.id}>
            {index > 0 ? <Separator inset={space.m} /> : null}
            <SessionRow
              session={session}
              now={now}
              withPlace
              media={media[session.id]}
              onDelete={onDelete}
            />
          </Fragment>
        ))}
      </Surface>
    </View>
  );
}
