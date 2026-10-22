import { type Station, periodOf } from "@repo/client/viewer/types";
import { TrashIcon, XIcon } from "@repo/ui/icon";
import { Link } from "expo-router";
import { type ReactNode, useRef } from "react";
import { type AccessibilityActionEvent, Platform, Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { placeHref } from "@/components/map/place-route";
import { FoundMark, SMALL_MARK } from "@/components/search/found-list";
import { Glyph } from "@/components/shared/glyph";
import { IconButton } from "@/components/ui/button";
import { FreshnessDot } from "@/components/ui/freshness-dot";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatSeconds, freshnessOf } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatHeight, useUnits } from "@/lib/units";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { type ActionKey, actionsOf, type RowContext } from "./actions";
import { ACTION_LOOKS, type PlaceActions, type PlaceItem } from "./place-actions";
import { kindWord } from "./place-words";
import { HeightChip } from "./sea-figures";

// A place in a list, as the web's `StationRow`, `BreakRow` and `SpotRow` draw it: on one line a
// finger's height, the mark of what it is, its name, and for a station what it read last, its
// height and its period with how recent they are, the mark then being the height's color with
// where the waves go. It stands on the screen's ground, tinted while it is pressed, and a press
// opens the place. In a list of the account's, the X at its end takes it out. A swipe to the left
// does the same, and a long press offers what else can be done with it, iOS's own context menu or
// Android's sheet: the platform's additions, which a screen reader finds among the row's actions.

const ACTION_WIDTH = 88;
/** The web's `icon-sm` under `lg`, which the X is. */
const SMALL_BUTTON = 40;

// What a place is, in words, which the widgets write too.
export { kindWord };

/** A row's place while what it says is on its way, the web's `StationRowSkeleton`. */
export function PlaceRowSkeleton() {
  const { space, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <View
        style={{
          flex: 1,
          minHeight: TARGET,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingHorizontal: space.xs,
        }}
      >
        <Skeleton width={SMALL_MARK} height={SMALL_MARK} round />
        <Skeleton width="40%" height={type.s.line} />
        <View style={{ flex: 1 }} />
        <Skeleton width={64} height={type.s.line} />
      </View>
      <View style={{ width: SMALL_BUTTON }} />
    </View>
  );
}

type PlaceRowProps = {
  item: PlaceItem;
  /** What a station read last, which its row writes beside its name. */
  station?: Station | undefined;
  /** The time a reading's age is read against. */
  now: number;
  context: RowContext;
  actions: PlaceActions;
  /** The X at its end, which takes the place out of the account's list it stands in. */
  removable?: boolean;
};

/** A place in a list. */
export function PlaceRow({
  item,
  station,
  now,
  context,
  actions,
  removable = false,
}: PlaceRowProps) {
  const { colors, space, radius } = useTheme();
  // The height is written in the reader's unit.
  useUnits();
  const swipeable = useRef<SwipeableMethods>(null);
  const { ref, name } = item;
  const offered = actionsOf(ref, context);

  const reading = station?.latestReading;
  const freshness = freshnessOf(reading?.observedAt, now);
  const height = freshness === "none" ? null : (reading?.significantHeightMeters ?? null);
  const period = freshness === "none" ? null : periodOf(reading);
  const figures = `${height === null ? "–" : formatHeight(height)}${
    period !== null ? ` · ${formatSeconds(period)}` : ""
  }`;
  const spoken = [height === null ? null : formatHeight(height), period && formatSeconds(period)]
    .filter(Boolean)
    .join(", ");
  const label = station
    ? `${name}, ${spoken || m.station_no_recent_reading()}`
    : ref.kind === "station"
      ? name
      : `${name}, ${kindWord(ref.kind)}`;

  const accessibilityActions = offered
    .filter((key) => key !== "open")
    .map((key) => ({
      name: key,
      label: key === "remove" ? m.saved_remove_station({ name }) : ACTION_LOOKS[key].label(),
    }));
  // A double tap opens the place as a press does: the actions are the rest of what it offers.
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const key = event.nativeEvent.actionName as ActionKey;
    if (offered.includes(key)) actions.run(key, item, context);
  };
  const open = () => actions.run("open", item, context);

  const mark =
    ref.kind === "station" && height !== null ? (
      <HeightChip meters={height} fromDegrees={reading?.peakDirectionDegrees ?? null} />
    ) : (
      <FoundMark kind={ref.kind} small />
    );

  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      // iOS's Link takes the press, for its menu: the row opens the place through it.
      onPress={Platform.OS === "ios" ? undefined : open}
      onLongPress={Platform.OS === "ios" ? undefined : () => actions.showSheet(item, context)}
      delayLongPress={350}
      style={{ flex: 1 }}
    >
      {/* expo-router's Link asChild merges its child's style by spreading it, which turns a
         style given as a function into nothing: what a press changes is drawn inside. */}
      {({ pressed }) => (
        <View
          style={{
            minHeight: TARGET,
            flexDirection: "row",
            alignItems: "center",
            gap: space.xs,
            paddingHorizontal: space.xs,
            borderRadius: radius.xs,
            borderCurve: "continuous",
            backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
          }}
        >
          {mark}
          <Text numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Text>
          {station ? (
            <>
              <Text size="s" tone="muted" numeric numberOfLines={1}>
                {figures}
              </Text>
              <FreshnessDot freshness={freshness} />
            </>
          ) : null}
        </View>
      )}
    </Pressable>
  );

  const opened =
    Platform.OS === "ios" ? (
      <Link
        href={placeHref(ref.kind, ref.id)}
        asChild
        // The place opens where the screen says, on the map from a tab: never pushed over it.
        onPress={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <Link.Trigger>{pressable}</Link.Trigger>
        <Link.Menu>{menuOf(offered, item, context, actions)}</Link.Menu>
      </Link>
    ) : (
      pressable
    );

  const row = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xxs,
        // A swipe slides the row over what it uncovers: it keeps the screen's ground.
        backgroundColor: colors["cte-canvas"],
      }}
    >
      {opened}
      {removable && offered.includes("remove") ? (
        <IconButton
          icon={XIcon}
          label={m.saved_remove_station({ name })}
          variant="ghost"
          size="small"
          onPress={() => actions.run("remove", item, context)}
        />
      ) : null}
    </View>
  );

  if (!offered.includes("remove")) return row;

  return (
    <Swipeable
      ref={swipeable}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      onSwipeableWillOpen={() => feel("select")}
      renderRightActions={() => (
        <Pressable
          // The row's own action says the same to a screen reader.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={() => {
            swipeable.current?.close();
            actions.run("remove", item, context);
          }}
          style={{
            width: ACTION_WIDTH,
            alignItems: "center",
            justifyContent: "center",
            gap: space.xxs,
            backgroundColor: colors.error,
          }}
        >
          <Glyph icon={TrashIcon} size={18} color={light["neutral-1"]} />
          <Text size="s" weight="medium" dense style={{ color: light["neutral-1"] }}>
            {m.native_remove()}
          </Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
}

/** iOS's context menu: what a row offers, with a submenu of the lists a place can move to. */
function menuOf(offered: ActionKey[], item: PlaceItem, context: RowContext, actions: PlaceActions) {
  return offered.map((key): ReactNode => {
    const look = ACTION_LOOKS[key];
    if (key === "move" && context.list) {
      const from = context.list;
      return (
        <Link.Menu key={key} title={look.label()} icon={look.symbol}>
          {(context.others ?? []).map((to) => (
            <Link.MenuAction
              key={to.id}
              icon="bookmark"
              onPress={() => void actions.move(item, from, to)}
            >
              {to.name}
            </Link.MenuAction>
          ))}
        </Link.Menu>
      );
    }
    return (
      <Link.MenuAction
        key={key}
        icon={look.symbol}
        destructive={look.destructive}
        onPress={() => actions.run(key, item, context)}
      >
        {look.label()}
      </Link.MenuAction>
    );
  });
}
