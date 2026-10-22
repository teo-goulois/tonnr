import type { Spot } from "@repo/client/viewer/types";
import {
  BookmarkFillIcon,
  BookmarkIcon,
  LockIcon,
  MoreHorizontalIcon,
  PinPlusIcon,
  XIcon,
} from "@repo/ui/icon";
import { type ReactNode, useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useOpenPage } from "@/components/account/open-page";
import { Glyph } from "@/components/shared/glyph";
import { IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { type Freshness, formatAgo, freshnessOf } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import type { PlaceRecord } from "./use-place";

// The head of a place's sheet, as the web's drawer heads a panel: the name, on one line, and
// under it what the place is: a break's source, a station's last reading, a spot's owner and
// whether it is private or public (decision 034). Then its buttons, drawn as the web's ghost
// buttons: the bookmark that keeps it in lists, the menu of what is seldom done with it, what
// copies a spot read in a shared list, and last what closes the sheet.

// The size of the lock beside a spot's line, the web's `size-3.5`.
const LOCK = 14;
// How wide the name and the line wait, the web's `w-48`, `w-32` and `w-24`.
const TITLE_WAITING = 192;
const LINE_WAITING = { break: 128, other: 96 };

// The dot of a station's reading, the web's `size-1.5`, and how long its ring takes to ping.
const DOT = 6;
const PING_MS = 1000;

/**
 * How recent a station's reading is: a dot, which the words beside it say too. A fresh one beats,
 * a ring of its color going out from it as Tailwind's `animate-ping` does, a second at a time,
 * unless motion was refused.
 */
function FreshnessDot({ freshness }: { freshness: Freshness }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const beats = freshness === "fresh" && !reduceMotion;
  const ping = useSharedValue(0);
  useEffect(() => {
    if (!beats) {
      ping.value = 0;
      return;
    }
    // Out to twice its size and gone by three quarters of the second, then still.
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PING_MS * 0.75, easing: Easing.bezier(0, 0, 0.2, 1) }),
        withTiming(1, { duration: PING_MS * 0.25 }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [beats, ping]);
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - ping.value,
    transform: [{ scale: 1 + ping.value }],
  }));
  const color =
    freshness === "fresh"
      ? colors.success
      : freshness === "aging"
        ? colors.warning
        : colors["neutral-6"];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }}
    >
      {beats && (
        <Animated.View
          style={[
            {
              position: "absolute",
              width: DOT,
              height: DOT,
              borderRadius: DOT / 2,
              backgroundColor: color,
            },
            ring,
          ]}
        />
      )}
    </View>
  );
}

/** What a spot says under its name: whose it is, and what became of a request to publish it. */
function spotLine(spot: Spot): { text: string; locked: boolean } {
  if (!spot.isOwner) return { text: m.spot_shared(), locked: false };
  const status = spot.publication?.status;
  if (status === "pending") return { text: m.spot_pending(), locked: false };
  if (status === "accepted") return { text: m.spot_accepted(), locked: false };
  if (status === "refused") {
    return { text: m.spot_refused({ reason: spot.publication?.reason ?? "" }), locked: true };
  }
  return { text: m.spot_own(), locked: true };
}

export function PlaceHeader({
  record,
  now,
  isSaved,
  onSave,
  onMenu,
  onCopy,
  isCopying = false,
  onClose,
}: {
  record: PlaceRecord;
  now: number;
  isSaved: boolean;
  // Undefined where nothing can be saved: a spot of someone else's, which is copied instead.
  onSave?: () => void;
  onMenu?: () => void;
  onCopy?: () => void;
  isCopying?: boolean;
  onClose: () => void;
}) {
  const { colors, space, type } = useTheme();
  const { openAddress } = useOpenPage();
  const { kind, name, found, station, spot, isPending, isError } = record;

  // What the place is, in the theme's ink, as the web draws it under the name rather than in the
  // grey its drawer gives a description.
  let line: ReactNode = null;
  if (kind === "break" && found) {
    const source = found.source.url;
    line = source ? (
      <Text
        size="s"
        accessibilityRole="link"
        onPress={() => void openAddress(source)}
        style={{ textDecorationLine: "underline" }}
      >
        {m.break_from_catalogue()}
      </Text>
    ) : (
      <Text size="s">{m.break_title()}</Text>
    );
  } else if (kind === "station" && station) {
    // Its newest reading, or the one the map holds until they come.
    const observedAt = record.latest?.observedAt;
    line = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
        <FreshnessDot freshness={freshnessOf(observedAt, now)} />
        <Text size="s">
          {observedAt ? formatAgo(observedAt, now) : m.station_no_recent_reading()}
        </Text>
      </View>
    );
  } else if (kind === "spot" && spot) {
    const said = spotLine(spot);
    line = (
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xxs }}>
        {said.locked && (
          // Beside the first line of the words, whatever their number.
          <View style={{ paddingTop: (type.s.line - LOCK) / 2 }}>
            <Glyph icon={LockIcon} size={LOCK} color={colors["neutral-10"]} />
          </View>
        )}
        <Text size="s" style={{ flexShrink: 1 }}>
          {said.text}
        </Text>
      </View>
    );
  }

  // A place that is gone keeps a name of its kind. A station that is gone says nothing of what it
  // was, which nothing knows any more: its panel says that it is not found.
  const title =
    name ??
    (isError
      ? kind === "break"
        ? m.break_title()
        : kind === "spot"
          ? m.spot_title()
          : null
      : undefined);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.xs,
        // Room over it for the grabber that the platform draws at the top of the sheet.
        paddingTop: space.m,
        paddingHorizontal: space.m,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        {title === undefined ? (
          <Skeleton height={type.l.line} width={TITLE_WAITING} />
        ) : title === null ? null : (
          <Text size="l" weight="medium" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        )}
        {isPending && !line ? (
          <Skeleton
            height={type.s.line}
            width={kind === "break" ? LINE_WAITING.break : LINE_WAITING.other}
          />
        ) : (
          line
        )}
      </View>
      {/* The buttons stand a little higher than the name, and reach the edge of the sheet with
          the room of their own circle, as the web's do. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xxs,
          marginTop: -space.xxs,
          marginRight: -space.xs,
        }}
      >
        {onSave && (
          <IconButton
            variant="ghost"
            icon={isSaved ? BookmarkFillIcon : BookmarkIcon}
            label={m.saved_add_to_list()}
            selected={isSaved}
            onPress={onSave}
          />
        )}
        {onMenu && (
          <IconButton
            variant="ghost"
            icon={MoreHorizontalIcon}
            label={m.spot_menu({ name: name ?? m.spot_title() })}
            onPress={onMenu}
          />
        )}
        {onCopy && (
          <IconButton
            variant="ghost"
            icon={PinPlusIcon}
            label={m.spot_copy({ name: name ?? m.spot_title() })}
            loading={isCopying}
            onPress={onCopy}
          />
        )}
        <IconButton variant="ghost" icon={XIcon} label={m.action_close()} onPress={onClose} />
      </View>
    </View>
  );
}
