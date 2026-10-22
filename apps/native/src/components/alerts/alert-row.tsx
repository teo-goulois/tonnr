import type { Alert } from "@repo/client/viewer/types";
import { ChevronRightIcon, PauseIcon, PlayIcon, TrashIcon } from "@repo/ui/icon";
import { Link } from "expo-router";
import { Alert as Dialog, Platform, Pressable, View } from "react-native";

import { confirmDestructive } from "@/components/saved/confirm";
import { Glyph } from "@/components/shared/glyph";
import { Badge } from "@/components/ui/badge";
import { feel } from "@/components/ui/haptics";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { AlertSummary } from "./alert-summary";
import { alertLine } from "./summary";
import { SwipeRow } from "./swipe-row";
import type { AlertActions } from "./use-alerts";

// An alert in a list, as the web's `MyAlerts` lists it: its name, its places, what it asks and
// its switch; or as its `SpotAlerts` does in a place's panel, what it asks before its other
// places, with a chevron. A press opens it. What the web has no way to show stays out of sight
// until it is reached for: a swipe from the leading edge pauses it for today, or lifts the pause
// (decision 072), and one from the trailing edge deletes it, with an undo; a long press opens the
// platform's menu over the row, on iOS its context menu, which lifts the row as its preview, on
// Android a dialog of the same actions. A screen reader finds them all among the row's actions,
// in the words of the web's buttons. A paused alert says so beside its name.

type AlertRowProps = {
  alert: Alert;
  actions: AlertActions;
  /**
   * The place whose panel lists it: its other places are said after "Also on", under what it
   * asks, and a chevron says that it opens, as the web's `SpotAlerts` draws it.
   */
  placeId?: string;
  /**
   * The web's list: the row on the screen's own ground, its words in line with the list's and its
   * press tinted in the transparent third grey. Else a cell of a grouped list, on the surface.
   */
  plain?: boolean;
};

/** Whether an alert is paused for today: the API says null once the pause is over. */
export const isPaused = (alert: Alert) => alert.awayUntil !== null;

export function AlertRow({ alert, actions, placeId, plain = false }: AlertRowProps) {
  const { colors, space, radius } = useTheme();
  // The heights and the wind are written in the unit their reader chose.
  useUnits();
  const paused = isPaused(alert);
  const line = alertLine(alert);
  const names = alert.places.flatMap((place) =>
    placeId !== undefined && (place.spotId ?? place.breakId) === placeId ? [] : [place.name],
  );
  const placesLine =
    names.length === 0
      ? undefined
      : placeId === undefined
        ? names.join(" · ")
        : `${m.alert_also_on()} ${names.join(" · ")}`;
  const places = placesLine ? (
    <Text size="s" tone="muted" numberOfLines={1}>
      {placesLine}
    </Text>
  ) : null;

  const open = () => actions.open(alert);
  const togglePause = () => (paused ? actions.resume(alert) : actions.pause(alert));
  const remove = () => actions.remove(alert);
  const duplicate = () => actions.duplicate(alert);
  // Android's long press: a dialog of the actions that the row's press does not do.
  const menu = () => {
    feel("hold");
    Dialog.alert(
      alert.name,
      undefined,
      [
        { text: m.native_alert_duplicate(), onPress: duplicate },
        {
          text: paused ? m.native_alert_resume() : m.native_push_not_today(),
          onPress: togglePause,
        },
        {
          text: m.action_delete(),
          style: "destructive",
          onPress: () => void askToDelete(alert).then((yes) => yes && remove()),
        },
      ],
      { cancelable: true },
    );
  };

  // On iOS the link presses it, and opens the menu as it is held.
  const body = (onPress?: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        alert.name,
        paused ? m.native_alert_paused() : undefined,
        ...(placeId === undefined ? [placesLine, line.spoken] : [line.spoken, placesLine]),
      ]
        .filter(Boolean)
        .join(". ")}
      accessibilityHint={m.alert_open({ name: alert.name })}
      accessibilityActions={[
        { name: "duplicate", label: m.alert_copy({ name: alert.name }) },
        {
          name: "pause",
          label: paused ? m.native_alert_resume() : m.native_push_not_today(),
        },
        { name: "delete", label: m.alert_delete({ name: alert.name }) },
      ]}
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName;
        if (action === "duplicate") duplicate();
        if (action === "pause") togglePause();
        if (action === "delete") void askToDelete(alert).then((yes) => yes && remove());
      }}
      onPress={onPress}
      onLongPress={Platform.OS === "android" ? menu : undefined}
      // expo-router's Link asChild merges its child's style by spreading it, which turns a style
      // given as a function into nothing: what a press changes is drawn inside, by the children.
      style={{ flex: 1 }}
    >
      {({ pressed }) => (
        <View
          style={[
            { flexDirection: "row", alignItems: "center", gap: space.xs },
            plain
              ? {
                  paddingHorizontal: space.xs,
                  paddingVertical: space.xs,
                  borderRadius: radius.xs,
                  borderCurve: "continuous",
                  backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
                }
              : { paddingVertical: space.s, paddingStart: space.m, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                flexWrap: "wrap",
              }}
            >
              <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                {alert.name}
              </Text>
              {paused ? <Badge tone="warning">{m.native_alert_paused()}</Badge> : null}
            </View>
            {placeId === undefined ? places : null}
            {/* Two alerts of one place are told apart by what they ask. */}
            <AlertSummary alert={alert} />
            {placeId === undefined ? null : places}
          </View>
          {placeId === undefined ? null : (
            <Glyph icon={ChevronRightIcon} size={16} color={colors["neutral-7"]} />
          )}
        </View>
      )}
    </Pressable>
  );

  return (
    <SwipeRow
      leading={{
        label: paused ? m.native_alert_resume() : m.native_push_not_today(),
        icon: paused ? PlayIcon : PauseIcon,
        tone: "warning",
        onAct: togglePause,
      }}
      trailing={{ label: m.action_delete(), icon: TrashIcon, tone: "danger", onAct: remove }}
    >
      {/* The ground a swipe moves over what it reveals: the screen's, or the grouped list's. Its
          parts stretch to the row's height, which the alert's words give: iOS's menu trigger
          does not centre what stands beside it, so the switch centres itself in its own column,
          as the web's row centres it. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          gap: space.s,
          // A plain row stands on the sheet's ground, which hides the swipe's under it as the
          // cell's surface does, and keeps its switch a small step in from its end.
          paddingEnd: plain ? space.xs : space.m,
          backgroundColor: colors[plain ? "cte-canvas" : "cte-surface"],
        }}
      >
        {Platform.OS === "ios" ? (
          <Link href={{ pathname: "/alert/[id]", params: { id: alert.id } }} asChild>
            <Link.Trigger>{body()}</Link.Trigger>
            <Link.Menu>
              <Link.MenuAction icon="pencil" onPress={open}>
                {m.native_alert_edit()}
              </Link.MenuAction>
              <Link.MenuAction icon="plus.square.on.square" onPress={duplicate}>
                {m.native_alert_duplicate()}
              </Link.MenuAction>
              <Link.MenuAction icon={paused ? "play.circle" : "pause.circle"} onPress={togglePause}>
                {paused ? m.native_alert_resume() : m.native_push_not_today()}
              </Link.MenuAction>
              <Link.MenuAction icon="trash" destructive onPress={remove}>
                {m.action_delete()}
              </Link.MenuAction>
            </Link.Menu>
          </Link>
        ) : (
          body(open)
        )}
        <View style={{ justifyContent: "center" }}>
          <Switch
            value={alert.enabled}
            disabled={actions.switching.includes(alert.id)}
            label={m.alerts_mine_switch({ name: alert.name })}
            onChange={(enabled) => actions.flip(alert, enabled)}
          />
        </View>
      </View>
    </SwipeRow>
  );
}

/**
 * Asks before a screen reader's action or a menu deletes an alert, the platform's own question:
 * the swipe and the context menu have the toast's undo instead. True when the person said to.
 */
export const askToDelete = (alert: Alert) =>
  confirmDestructive({
    title: m.native_alert_delete_title({ name: alert.name }),
    message: m.native_alert_delete_message(),
    confirm: m.action_delete(),
  });
