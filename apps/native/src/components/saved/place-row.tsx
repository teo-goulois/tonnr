import { PinIcon, TrashIcon, WaveIcon, WindIcon } from "@repo/ui/icon";
import { Link } from "expo-router";
import { type ReactNode, useRef } from "react";
import { type AccessibilityActionEvent, PixelRatio, Platform, Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatAgo, formatClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { light } from "@/theme/tokens";
import { m } from "@/paraglide/messages";

import { type ActionKey, actionsOf, type RowContext } from "./actions";
import { ACTION_LOOKS, type PlaceActions, type PlaceItem, placeHref } from "./place-actions";
import { Bearing, HeightPill, SeaLine, WindPill, seaWords, shoreWord } from "./sea-figures";
import { type SeaFigures, type SeaNow, seaFiguresOf, type Told } from "./sea-now";

// A place in a list, as the saved tab, a list and a list opened by its link show it: what it is,
// its name, and the sea there now, its height on the color of the sea's scale. A press opens the
// place. A swipe to the left takes it out of the account's list, and a long press offers what
// else can be done with it: iOS's own context menu under a preview of the sea there, Android's
// sheet. A screen reader finds the same among the row's actions.

const TILE = 32;
const ACTION_WIDTH = 88;

/** What a place is, in words: a surf break, a buoy, a wind station, a spot. */
export function kindWord(place: PlaceItem["ref"]["kind"], sea?: SeaNow) {
  if (place === "break") return m.break_title();
  if (place === "spot") return m.spot_title();
  return sea?.place.kind === "station" && !sea.place.measures.includes("waves")
    ? m.native_kind_wind_station()
    : m.native_kind_buoy();
}

/** The mark of what a place is: a surf break dark, a spot of one's own in the accent, a station round. */
export function PlaceTile({ kind, sea }: { kind: PlaceItem["ref"]["kind"]; sea?: SeaNow }) {
  const { colors } = useTheme();
  const windOnly = sea?.place.kind === "station" && !sea.place.measures.includes("waves");
  const look =
    kind === "break"
      ? { ground: colors["neutral-10"], ink: colors["neutral-1"], icon: WaveIcon, round: false }
      : kind === "spot"
        ? { ground: colors["color-1"], ink: colors["neutral-1"], icon: PinIcon, round: false }
        : {
            ground: colors["neutral-3"],
            ink: colors["neutral-10"],
            icon: windOnly ? WindIcon : WaveIcon,
            round: true,
          };
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: TILE,
        height: TILE,
        borderRadius: look.round ? TILE / 2 : 9,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: look.ground,
      }}
    >
      <Glyph icon={look.icon} size={16} color={look.ink} />
    </View>
  );
}

/** A row's place while what it says is on its way. */
export function PlaceRowSkeleton() {
  const { space } = useTheme();
  return (
    <View
      style={{
        minHeight: 60,
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
      }}
    >
      <Skeleton width={TILE} height={TILE} round />
      <View style={{ flex: 1, gap: space.xxs }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={56} height={28} round />
    </View>
  );
}

type PlaceRowProps = {
  item: PlaceItem;
  /**
   * What `places.now` said of it: null when it said nothing of it, a spot the reader may see in
   * a list and not ask the sea of, and undefined when no answer came.
   */
  told: Told | null | undefined;
  /** Whether the answer is on its way: the sea's place waits for it. */
  pending: boolean;
  context: RowContext;
  actions: PlaceActions;
};

/** A place in a list. */
export function PlaceRow({ item, told, pending, context, actions }: PlaceRowProps) {
  const { colors, space } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const sea = told?.sea;
  const name = sea?.place.name ?? item.name;
  const figures = told ? seaFiguresOf(told.sea, told.at) : null;
  const shown: PlaceItem = { ref: item.ref, name };
  const offered = actionsOf(item.ref, context);
  const kind = kindWord(item.ref.kind, sea);

  const accessibilityActions = offered
    .filter((key) => key !== "open")
    .map((key) => ({
      name: key,
      label: key === "remove" ? m.saved_remove_station({ name }) : ACTION_LOOKS[key].label(),
    }));
  // A double tap opens the place as a press does: the actions are the rest of what it offers.
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const key = event.nativeEvent.actionName as ActionKey;
    if (offered.includes(key)) actions.run(key, shown, context);
  };

  const body = (
    <View
      style={{
        minHeight: Math.max(TARGET, 60),
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingHorizontal: space.m,
        paddingVertical: space.xs,
      }}
    >
      <PlaceTile kind={item.ref.kind} sea={sea} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="medium" numberOfLines={1}>
          {name}
        </Text>
        {figures ? (
          <SeaLine figures={figures} />
        ) : pending ? (
          <Skeleton width="45%" height={11} />
        ) : (
          <Text size="s" tone="muted" dense numberOfLines={1}>
            {kind}
          </Text>
        )}
      </View>
      {figures === null ? (
        pending ? (
          <Skeleton width={56} height={28} round />
        ) : (
          <Text tone="muted" numeric>
            –
          </Text>
        )
      ) : figures.heightMeters !== null ? (
        <HeightPill meters={figures.heightMeters} />
      ) : figures.windKnots !== null ? (
        <WindPill knots={figures.windKnots} />
      ) : (
        <Text tone="muted" numeric>
          –
        </Text>
      )}
    </View>
  );

  const pressable = (onLongPress?: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={figures ? `${name}, ${kind}, ${seaWords(figures)}` : `${name}, ${kind}`}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors["neutral-3"] : colors["cte-surface"],
      })}
    >
      {body}
    </Pressable>
  );

  const row =
    Platform.OS === "ios" ? (
      <Link href={placeHref(item.ref)} asChild>
        <Link.Trigger>{pressable()}</Link.Trigger>
        <Link.Preview
          style={{ width: 340, height: Math.round(250 * Math.min(PixelRatio.getFontScale(), 1.6)) }}
        >
          <PlacePreview name={name} kind={kind} figures={figures} sea={sea} />
        </Link.Preview>
        <Link.Menu>{menuOf(offered, shown, context, actions)}</Link.Menu>
      </Link>
    ) : (
      // Android's Link would take the press: the row opens the place itself, and holds for the sheet.
      <Link href={placeHref(item.ref)} asChild>
        {pressable(() => actions.showSheet(shown, context))}
      </Link>
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
            actions.run("remove", shown, context);
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

/** What a long press shows of a place on iOS, over its menu: the sea there now, bigger. */
function PlacePreview({
  name,
  kind,
  figures,
  sea,
}: {
  name: string;
  kind: string;
  figures: SeaFigures | null;
  sea: SeaNow | undefined;
}) {
  const { colors, space } = useTheme();
  const tide = figures?.nextTide;
  return (
    <View style={{ flex: 1, padding: space.m, gap: space.s, backgroundColor: colors["neutral-1"] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
        {sea ? <PlaceTile kind={sea.place.kind} sea={sea} /> : null}
        <View style={{ flex: 1 }}>
          <Text size="s" tone="muted" numberOfLines={1}>
            {kind}
          </Text>
          <Text size="l" weight="medium" numberOfLines={2}>
            {name}
          </Text>
        </View>
      </View>
      {figures ? (
        <>
          <Text size="s" weight="medium" tone="muted">
            {m.page_sea_now()}
          </Text>
          <View
            style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s }}
          >
            {figures.heightMeters !== null ? (
              <HeightPill meters={figures.heightMeters} size="large" />
            ) : null}
            {figures.windKnots !== null ? (
              <WindPill knots={figures.windKnots} size="large" />
            ) : null}
          </View>
          <SeaLine figures={figures} />
          {figures.atShore && figures.windFromDegrees !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Bearing fromDegrees={figures.windFromDegrees} />
              <Text size="s" tone="muted">
                {shoreWord(figures.atShore)}
              </Text>
            </View>
          ) : null}
          {tide ? (
            <Text size="s" tone="muted" numeric>
              {`${tide.type === "high" ? m.page_tide_high() : m.page_tide_low()} ${formatClock(tide.time)}`}
            </Text>
          ) : null}
          {figures.from === "measured" && figures.observedAt ? (
            <Text size="xs" tone="muted">
              {m.page_measured_ago({ ago: formatAgo(figures.observedAt, Date.now()) })}
            </Text>
          ) : null}
        </>
      ) : (
        <View style={{ gap: space.xs }}>
          <Skeleton width={120} height={40} round />
          <Skeleton width="60%" height={12} />
        </View>
      )}
    </View>
  );
}
