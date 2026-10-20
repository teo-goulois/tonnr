import type { Alert } from "@repo/client/viewer/types";
import { PauseIcon, PlayIcon, TrashIcon } from "@repo/ui/icon";
import { Link } from "expo-router";
import { Alert as Dialog, Platform, Pressable, View } from "react-native";

import { confirmDestructive } from "@/components/saved/confirm";
import { Glyph } from "@/components/shared/glyph";
import { feel } from "@/components/ui/haptics";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { alertLine } from "./summary";
import { SwipeRow } from "./swipe-row";
import type { AlertActions } from "./use-alerts";

// An alert in a list: its name, its places, what it asks and its switch, as the web's `MyAlerts`
// and `SpotAlerts` list it. A press opens it. A swipe from the leading edge pauses it for today,
// or lifts the pause (decision 072), and one from the trailing edge deletes it, with an undo. A
// long press opens the platform's menu over the row: on iOS its context menu, which lifts the row
// as its preview, on Android a dialog of the same actions. A screen reader finds them all among
// the row's actions.

type AlertRowProps = {
  alert: Alert;
  actions: AlertActions;
  /** The place whose panel lists it: its other places are said after "Also on". */
  placeId?: string;
};

/** Whether an alert is paused for today: the API says null once the pause is over. */
export const isPaused = (alert: Alert) => alert.awayUntil !== null;

export function AlertRow({ alert, actions, placeId }: AlertRowProps) {
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
        placesLine,
        line.spoken,
      ]
        .filter(Boolean)
        .join(". ")}
      accessibilityHint={m.alert_open({ name: alert.name })}
      accessibilityActions={[
        { name: "duplicate", label: m.native_alert_duplicate() },
        {
          name: "pause",
          label: paused ? m.native_alert_resume() : m.native_push_not_today(),
        },
        { name: "delete", label: m.action_delete() },
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
          style={{
            gap: space.xxs,
            paddingVertical: space.s,
            paddingStart: space.m,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}
          >
            <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
              {alert.name}
            </Text>
            {paused ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.xxs,
                  paddingHorizontal: space.xs,
                  paddingVertical: 2,
                  borderRadius: radius.xs,
                  backgroundColor: colors["warning-transparent"],
                }}
              >
                <PauseGlyph />
                <Text size="xs" weight="medium" dense>
                  {m.native_alert_paused()}
                </Text>
              </View>
            ) : null}
          </View>
          {placesLine ? (
            <Text size="s" tone="muted" numberOfLines={1}>
              {placesLine}
            </Text>
          ) : null}
          {line.shown ? (
            <Text size="s" tone="muted" numberOfLines={2}>
              {line.shown}
            </Text>
          ) : null}
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          paddingEnd: space.m,
          backgroundColor: colors["cte-surface"],
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
        <Switch
          value={alert.enabled}
          disabled={actions.switching.includes(alert.id)}
          label={m.alerts_mine_switch({ name: alert.name })}
          onChange={(enabled) => actions.flip(alert, enabled)}
        />
      </View>
    </SwipeRow>
  );
}

// The sign of a pause, beside its words: a pause is told by more than its color.
function PauseGlyph() {
  const { colors } = useTheme();
  return <Glyph icon={PauseIcon} size={12} color={colors["neutral-10"]} />;
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
