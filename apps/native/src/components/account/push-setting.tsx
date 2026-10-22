import { APP_NAME } from "@repo/config/app";
import { TrashIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Linking, Platform, View } from "react-native";

import { Button, IconButton } from "@/components/ui/button";
import { Row } from "@/components/ui/list";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { formatAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { PhonePush, PhonePushState } from "@/lib/use-push";
import { m } from "@/paraglide/messages";

// What the row says under its name: what stands in the way of its switch, what the switch is
// doing, or what push is. The web's PushSetting says the same of a browser, and a phone's own
// words where the system's settings hold the answer.
function wordsOf(state: PhonePushState) {
  if (state.kind === "unknown") return m.push_unknown();
  if (state.kind === "none") return m.push_none();
  if (state.kind === "refused") return m.native_push_refused({ name: APP_NAME });
  if (state.kind === "loading" || !state.isBusy) return m.push_hint();
  return state.kind === "off" ? m.push_switching_on() : m.push_switching_off();
}

function failureOf(failure: "on" | "off" | "full") {
  if (failure === "full") return m.push_full();
  return failure === "on" ? m.push_failed_on() : m.push_failed_off();
}

/** Says a failure to a screen reader on iOS as it comes: Android's live region on the line does. */
function useSaid(words: string | undefined) {
  useEffect(() => {
    if (words && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(words);
  }, [words]);
}

/**
 * The row "On this device" of the alerts' settings and the account's devices under it, among the
 * rows of "How to tell me" as the web's `PushSetting` stands there: push on this phone, switched
 * by the person and never asked as the app opens (decision 072), and on an iPhone whose instance
 * starts them, the switch of its Live Activities (decision 074). What fails is said in a red line
 * under the row's words, which stay.
 */
export function PushSetting({ push }: { push: PhonePush }) {
  const tell = useTell();
  const { space, type } = useTheme();
  const { state, activities } = push;
  const [now, setNow] = useState(Date.now);
  // "Seen 5 min ago" moves on while the settings are open.
  useEffect(() => {
    const ticking = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(ticking);
  }, []);

  const hasSwitch = state.kind === "on" || state.kind === "off";
  const isBusy = hasSwitch && state.isBusy;
  const failure = hasSwitch && state.failure ? failureOf(state.failure) : undefined;
  const hasActivities = activities.kind === "on" || activities.kind === "off";
  const activitiesFailure =
    hasActivities && activities.failed ? m.native_activities_failed() : undefined;
  useSaid(failure);
  useSaid(activitiesFailure);
  // This phone first, then the others as the API lists them.
  const listed = [...push.devices].sort(
    (a, b) => Number(b.id === push.here) - Number(a.id === push.here),
  );

  // A device goes at once, as on the web: this phone as push is switched off here.
  async function remove(device: (typeof listed)[number]) {
    const removed = await push.remove(device);
    if (removed === false) tell({ title: m.push_remove_failed(), tone: "danger" });
  }

  return (
    <>
      {state.kind === "loading" ? (
        <Loading>
          <Skeleton height={type.m.line} width="60%" />
        </Loading>
      ) : (
        <Row
          title={m.push_title()}
          description={wordsOf(state)}
          {...(failure && { note: failure })}
          // Its name is muted while there is no switch; a switch on its way holds still alone.
          disabled={!hasSwitch}
          {...(hasSwitch && {
            toggle: {
              value: state.kind === "on",
              onChange: (on: boolean) => void push.flip(on),
              disabled: isBusy,
            },
          })}
        />
      )}
      {state.kind === "unknown" ? (
        <Button variant="ghost" onPress={push.retry} style={{ alignSelf: "flex-start" }}>
          {m.push_retry()}
        </Button>
      ) : null}
      {/* Only the system's settings can change a refusal now. */}
      {state.kind === "refused" ? (
        <Button
          variant="ghost"
          onPress={() => void Linking.openSettings()}
          style={{ alignSelf: "flex-start" }}
        >
          {m.native_open_settings()}
        </Button>
      ) : null}
      {/* The iPhone's Live Activities, whose words say what Apple reads before the switch is
          turned on: decision 074. */}
      {hasActivities ? (
        <Row
          title={m.native_activities_title()}
          description={m.native_activities_hint()}
          {...(activitiesFailure && { note: activitiesFailure })}
          toggle={{
            value: activities.kind === "on",
            onChange: (on) => void push.flipActivities(on),
            disabled: activities.isBusy,
          }}
        />
      ) : null}
      {activities.kind === "system-off" ? (
        <Row
          title={m.native_activities_title()}
          description={m.native_activities_system_off({ name: APP_NAME })}
          onPress={() => void Linking.openSettings()}
        />
      ) : null}

      {push.devicesFailed ? (
        <Text size="s" tone="muted">
          {m.push_devices_failed()}
        </Text>
      ) : null}
      {listed.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <Text size="s" tone="muted">
            {m.push_devices()}
          </Text>
          <View style={{ gap: space.xxs }}>
            {listed.map((device) => {
              const isHere = device.id === push.here;
              const name =
                device.label ??
                (device.kind === "web" ? m.push_device_unnamed() : m.native_push_device_phone());
              return (
                <Row
                  key={device.id}
                  title={name}
                  {...(isHere && { badge: m.push_device_here() })}
                  description={m.push_device_seen({ ago: formatAgo(device.seenAt, now) })}
                  accessory={
                    <IconButton
                      icon={TrashIcon}
                      label={m.push_device_remove({ name })}
                      variant="ghost"
                      disabled={push.removing.includes(device.id) || (isHere && isBusy)}
                      onPress={() => void remove(device)}
                    />
                  }
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );
}
