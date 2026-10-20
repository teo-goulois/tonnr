import { APP_NAME } from "@repo/config/app";
import { BellIcon } from "@repo/ui/icon";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { confirmDestructive } from "@/components/saved/confirm";
import { Row, Section } from "@/components/ui/list";
import { SkeletonText } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { formatAgo } from "@/lib/format";
import { type PhonePushState, usePhonePush } from "@/lib/use-push";
import { m } from "@/paraglide/messages";

// What the row says under its name: what stands in the way of its switch, what the switch is
// doing, or what push is. The web's PushSetting says the same of a browser.
function wordsOf(state: PhonePushState) {
  if (state.kind === "unknown") return m.push_unknown();
  if (state.kind === "none") return m.push_none();
  if (state.kind === "refused") return m.native_push_refused({ name: APP_NAME });
  if (state.kind === "loading" || !state.isBusy) {
    if (state.kind !== "loading" && state.failure === "full") return m.push_full();
    if (state.kind !== "loading" && state.failure) {
      return state.failure === "on" ? m.push_failed_on() : m.push_failed_off();
    }
    return m.push_hint();
  }
  return state.kind === "off" ? m.push_switching_on() : m.push_switching_off();
}

/**
 * The row "On this device" of the alerts' settings, and the account's devices under it: push on
 * this phone, switched by the person and never asked as the app opens (decision 072).
 */
export function PushSetting() {
  const { userId } = useAccount();
  const push = usePhonePush(userId);
  const tell = useTell();
  const { space } = useTheme();
  const { state } = push;
  const [now, setNow] = useState(Date.now);
  // "Seen 5 min ago" moves on while the settings are open.
  useEffect(() => {
    const ticking = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(ticking);
  }, []);

  const hasSwitch = state.kind === "on" || state.kind === "off";
  // This phone first, then the others as the API lists them.
  const listed = [...push.devices].sort(
    (a, b) => Number(b.id === push.here) - Number(a.id === push.here),
  );

  async function askRemove(device: (typeof listed)[number], name: string) {
    const sure = await confirmDestructive({
      title: m.push_device_remove({ name }),
      confirm: m.push_device_remove({ name }),
    });
    if (!sure) return;
    const removed = await push.remove(device);
    if (removed === false) tell({ title: m.push_remove_failed(), tone: "danger" });
  }

  return (
    <>
      <Section>
        {state.kind === "loading" ? (
          <View key="loading" style={{ padding: space.m }}>
            <SkeletonText lines={2} />
          </View>
        ) : (
          <Row
            key="switch"
            icon={BellIcon}
            title={m.push_title()}
            description={wordsOf(state)}
            disabled={!hasSwitch || state.isBusy}
            {...(hasSwitch && {
              toggle: { value: state.kind === "on", onChange: (on) => void push.flip(on) },
            })}
          />
        )}
        {state.kind === "refused" ? (
          <Row
            key="settings"
            title={m.native_open_settings()}
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        {state.kind === "unknown" ? (
          <Row key="retry" title={m.push_retry()} chevron={false} onPress={push.retry} />
        ) : null}
      </Section>
      {push.devicesFailed ? (
        <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
          {m.push_devices_failed()}
        </Text>
      ) : null}
      {listed.length > 0 ? (
        <Section title={m.push_devices()}>
          {listed.map((device) => {
            const isHere = device.id === push.here;
            const name =
              device.label ??
              (device.kind === "web" ? m.push_device_unnamed() : m.native_push_device_phone());
            return (
              <Row
                key={device.id}
                title={name}
                description={m.push_device_seen({ ago: formatAgo(device.seenAt, now) })}
                {...(isHere && { value: m.push_device_here() })}
                disabled={push.removing.includes(device.id)}
                chevron={false}
                accessibilityHint={m.push_device_remove({ name })}
                onPress={() => void askRemove(device, name)}
              />
            );
          })}
        </Section>
      ) : null}
    </>
  );
}
