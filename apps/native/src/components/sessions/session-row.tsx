import type { MediaItem, Session } from "@repo/client/viewer/types";
import { ChevronRightIcon, TrashIcon } from "@repo/ui/icon";
import { Image } from "expo-image";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Platform, Pressable, View } from "react-native";

import { SwipeRow } from "@/components/alerts/swipe-row";
import { placeHref } from "@/components/map/place-route";
import { Picture } from "@/components/media/media-tile";
import { confirmDestructive } from "@/components/saved/confirm";
import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { formatClock, formatDate, formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { RatingStars } from "./rating";
import { openPlaceOnMap } from "./session-place";
import { SessionSea } from "./session-sea";

// A session on a line of a list, the log or a place's, as the web's `SessionRow` draws it: where or
// when it was, its rating, what the sea did, and its first photo small, on the screen's own
// ground, the list that holds the rows laying their room outside it (`-mx-xs`). A press opens it;
// a long press opens its menu, the platform's own on iOS, with what a press on its place and its
// deletion do; a swipe to the left asks to delete it. Each is named `action_delete`, as the web's
// sheet names its first press, and the platform's question then confirms with
// `session_delete_confirm`, as the web's second press does. Decisions 043 and 066.

/** When a session was and how long it lasted, as "Sat 10 Oct · 09:00 · 1 h 30". */
export function sessionWhen(session: Pick<Session, "startedAt" | "durationMinutes">, now: number) {
  return [
    formatDate(session.startedAt, now),
    formatClock(session.startedAt),
    formatDuration(session.durationMinutes),
  ].join(" · ");
}

/** The sheet of a session's place, while the place is there. */
export function sessionPlaceHref(session: Pick<Session, "place">) {
  const { spotId, breakId } = session.place;
  if (spotId) return placeHref("spot", spotId);
  if (breakId) return placeHref("break", breakId);
  return null;
}

/** Asks whether to delete a session, the platform's way. True when the person said to. */
export const askToDelete = () =>
  confirmDestructive({
    title: m.native_session_delete_title(),
    message: m.native_session_delete_message(),
    confirm: m.session_delete_confirm(),
  });

/**
 * The rows of a list as the web lays them (`-mx-xs grid gap-xxs`): a little apart, their room
 * laid outside the list, so that their words stand in line with the title over them and only a
 * press shows how wide they are. The log's lists and a place's sessions.
 */
export function RowList({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return <View style={{ gap: space.xxs, marginHorizontal: -space.xs }}>{children}</View>;
}

type SessionRowProps = {
  session: Session;
  now: number;
  /** A list of several places says the place first; a list of one place, the day. */
  withPlace?: boolean;
  media?: readonly MediaItem[] | undefined;
  /** Deletes the session, once the person said to. */
  onDelete: (session: Session) => void;
  /**
   * Drawn as the web draws its rows in a place's panel: on the sheet's own ground, with the web's
   * room around it and a rounded ground as it is pressed, a smaller photo and a darker chevron.
   * The log's rows keep the ground of the card that groups them.
   */
  plain?: boolean;
};

const THUMB = 44;
// The web's `size-10`, at the theme's smallest radius.
const PLAIN_THUMB = 40;
const PREVIEW_WIDTH = 320;

/** What a long press lifts out of the list: the session larger, its first photo over it. */
function SessionPreview({
  session,
  when,
  photo,
}: {
  session: Session;
  when: string;
  photo: MediaItem | null;
}) {
  const { colors, space } = useTheme();
  const source = photo?.display ?? photo?.thumb;
  return (
    <View style={{ width: PREVIEW_WIDTH, backgroundColor: colors["neutral-1"] }}>
      {source ? (
        <Image
          source={{ uri: source }}
          placeholder={photo?.thumb ? { uri: photo.thumb } : undefined}
          contentFit="cover"
          style={{ width: PREVIEW_WIDTH, height: (PREVIEW_WIDTH * 3) / 4 }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={{ gap: space.xxs, padding: space.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {session.place.name}
          </Text>
          <RatingStars rating={session.rating} />
        </View>
        <Text size="s" tone="muted" numeric>
          {when}
        </Text>
        <SessionSea session={session} />
        {session.note ? (
          <Text size="s" numberOfLines={3}>
            {session.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function SessionRow({
  session,
  now,
  withPlace = false,
  media,
  onDelete,
  plain = false,
}: SessionRowProps) {
  const { colors, space, radius } = useTheme();
  const first = media?.find((item) => item.state === "ready" && item.thumb);
  const when = sessionWhen(session, now);
  // A list of one place has it open already.
  const place = withPlace ? sessionPlaceHref(session) : null;
  const href = `/session/${session.id}` as const;

  const remove = async () => {
    if (await askToDelete()) onDelete(session);
  };

  // Android has no menu of its own on a long press: the same choices in a dialog.
  const longPress = () => {
    feel("hold");
    Alert.alert(withPlace ? session.place.name : when, undefined, [
      ...(place ? [{ text: m.session_open_place(), onPress: () => openPlaceOnMap(place) }] : []),
      { text: m.action_delete(), style: "destructive" as const, onPress: () => void remove() },
      { text: m.action_cancel(), style: "cancel" as const },
    ]);
  };

  const row = (
    <Pressable
      accessibilityRole="button"
      // What the swipe and the long press offer, for a screen reader: in the row's actions.
      accessibilityActions={[
        ...(place ? [{ name: "place", label: m.session_open_place() }] : []),
        { name: "delete", label: m.action_delete() },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "delete") void remove();
        if (event.nativeEvent.actionName === "place" && place) openPlaceOnMap(place);
      }}
      onLongPress={Platform.OS === "android" ? longPress : undefined}
    >
      {/* expo-router's Link asChild merges its child's style by spreading it, which turns a
         style given as a function into nothing: what a press changes is drawn inside. */}
      {({ pressed }) => (
        // A plain row stands on the sheet's ground, which hides the swipe's under it as the
        // card's surface does, and rounds what a press lights, in the web's transparent grey.
        <View style={plain ? { backgroundColor: colors["cte-canvas"] } : undefined}>
          <View
            style={{
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: plain ? space.xs : space.s,
              paddingHorizontal: plain ? space.xs : space.m,
              paddingVertical: space.xs,
              backgroundColor: pressed
                ? colors[plain ? "neutral-3-transparent" : "neutral-3"]
                : plain
                  ? "transparent"
                  : colors["cte-surface"],
              ...(plain && { borderRadius: radius.xs, borderCurve: "continuous" as const }),
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: plain ? space.xxs : 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Text numberOfLines={1} style={{ flexShrink: 1 }}>
                  {withPlace ? session.place.name : when}
                </Text>
                <RatingStars rating={session.rating} />
              </View>
              {withPlace ? (
                <Text size="s" tone="muted" numeric numberOfLines={1}>
                  {when}
                </Text>
              ) : null}
              <SessionSea session={session} />
            </View>
            {first?.thumb ? (
              <Picture
                uri={first.thumb}
                size={plain ? PLAIN_THUMB : THUMB}
                {...(plain && { corner: radius.xs })}
                recyclingKey={first.id}
              />
            ) : null}
            <Glyph
              icon={ChevronRightIcon}
              size={plain ? 15 : 16}
              color={colors[plain ? "neutral-7" : "neutral-6"]}
            />
          </View>
        </View>
      )}
    </Pressable>
  );

  // A swipe from the trailing edge asks to delete it, as the alerts' rows and the assistants'.
  return (
    <SwipeRow
      trailing={{
        label: m.action_delete(),
        icon: TrashIcon,
        tone: "danger",
        onAct: () => void remove(),
      }}
    >
      {/* The ground a swipe moves over what it reveals: the screen's own. */}
      <View style={{ backgroundColor: colors["cte-canvas"] }}>
        {Platform.OS === "ios" ? (
          <Link href={href} asChild>
            <Link.Trigger>{row}</Link.Trigger>
            {/* A long press on iOS lifts the session out of its list, larger, over its menu. */}
            <Link.Preview style={{ width: PREVIEW_WIDTH }}>
              <SessionPreview session={session} when={when} photo={first ?? null} />
            </Link.Preview>
            <Link.Menu>
              {place ? (
                <Link.MenuAction icon="mappin.and.ellipse" onPress={() => openPlaceOnMap(place)}>
                  {m.session_open_place()}
                </Link.MenuAction>
              ) : null}
              <Link.MenuAction icon="trash" destructive onPress={() => void remove()}>
                {m.action_delete()}
              </Link.MenuAction>
            </Link.Menu>
          </Link>
        ) : (
          // Android has no preview: the row opens the session, and its long press the dialog, as
          // the saved tab's rows do.
          <Link href={href} asChild>
            {row}
          </Link>
        )}
      </View>
    </SwipeRow>
  );
}
