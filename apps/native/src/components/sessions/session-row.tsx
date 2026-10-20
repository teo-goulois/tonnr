import type { MediaItem, Session } from "@repo/client/viewer/types";
import { ChevronRightIcon, TrashIcon } from "@repo/ui/icon";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useRef } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { Picture } from "@/components/media/media-tile";
import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Text } from "@/components/ui/text";
import { formatClock, formatDate, formatDuration } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { RatingStars } from "./rating";
import { openPlaceOnMap } from "./session-place";
import { SessionSea } from "./session-sea";

// A session on a line of a list, the log or a place's: where or when it was, its rating, what the
// sea did, and its first photo small. A press opens it; a long press opens its menu, the
// platform's own on iOS, with what a press on its place and its deletion do; a swipe to the left
// offers to delete it. Decisions 043 and 066.

/** When a session was and how long it lasted, as "Sat 10 Oct · 09:00 · 1 h 30". */
export function sessionWhen(session: Pick<Session, "startedAt" | "durationMinutes">, now: number) {
  return [
    formatDate(session.startedAt, now),
    formatClock(session.startedAt),
    formatDuration(session.durationMinutes),
  ].join(" · ");
}

/** The page of a session's place, while the place is there. */
export function placeHref(session: Pick<Session, "place">) {
  const { spotId, breakId } = session.place;
  if (spotId) return `/place/spot/${spotId}` as const;
  if (breakId) return `/place/break/${breakId}` as const;
  return null;
}

/** Asks whether to delete a session, the platform's way. True when the person said to. */
export function askToDelete(): Promise<boolean> {
  feel("warn");
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: m.native_session_delete_title(),
          message: m.native_session_delete_message(),
          options: [m.session_delete_confirm(), m.action_cancel()],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => resolve(index === 0),
      );
      return;
    }
    Alert.alert(
      m.native_session_delete_title(),
      m.native_session_delete_message(),
      [
        { text: m.action_cancel(), style: "cancel", onPress: () => resolve(false) },
        { text: m.action_delete(), style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

type SessionRowProps = {
  session: Session;
  now: number;
  /** A list of several places says the place first; a list of one place, the day. */
  withPlace?: boolean;
  media?: readonly MediaItem[] | undefined;
  /** Deletes the session, once the person said to. */
  onDelete: (session: Session) => void;
};

const THUMB = 44;
const ACTION_WIDTH = 88;
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

export function SessionRow({ session, now, withPlace = false, media, onDelete }: SessionRowProps) {
  const { colors, space } = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const first = media?.find((item) => item.state === "ready" && item.thumb);
  const when = sessionWhen(session, now);
  // A list of one place has it open already.
  const place = withPlace ? placeHref(session) : null;
  const href = `/session/${session.id}` as const;

  const remove = async () => {
    swipe.current?.close();
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
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
        backgroundColor: pressed ? colors["neutral-3"] : colors["cte-surface"],
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
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
      {first?.thumb ? <Picture uri={first.thumb} size={THUMB} recyclingKey={first.id} /> : null}
      <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-6"]} />
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipe}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.action_delete()}
          onPress={() => void remove()}
          style={({ pressed }) => ({
            width: ACTION_WIDTH,
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            backgroundColor: colors.error,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Glyph icon={TrashIcon} size={18} color={light["neutral-1"]} />
          <Text size="xs" weight="medium" dense style={{ color: light["neutral-1"] }}>
            {m.action_delete()}
          </Text>
        </Pressable>
      )}
    >
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
            {m.session_delete_confirm()}
          </Link.MenuAction>
        </Link.Menu>
      </Link>
    </Swipeable>
  );
}
