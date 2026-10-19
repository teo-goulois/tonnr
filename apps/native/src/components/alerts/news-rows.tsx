import type { AlertNotification, ReportNotice } from "@repo/client/viewer/types";
import {
  CameraIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  MoonIcon,
  OctagonXIcon,
  WaveIcon,
} from "@repo/ui/icon";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Glyph, type GlyphIcon } from "@/components/shared/glyph";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { UnreadDot } from "./grouped";
import { SwipeRow } from "./swipe-row";
import {
  MOMENT_WORDS,
  type Moment,
  agoWords,
  buoyWords,
  lineWords,
  noticeWords,
  notificationTitle,
} from "./told";

// A row of what was told: a notification of an alert, or a notice of reports, as the web's
// `AlertsPanel` lists them. A swipe from the leading edge marks it read, and so does the row's
// own action for a screen reader.

// The sign of each moment: decision 031, "The moments". "Gone" is said quieter.
const MOMENT_ICONS: Record<Moment, { icon: GlyphIcon; quiet?: boolean }> = {
  found: { icon: CircleCheckIcon },
  moved: { icon: ClockIcon },
  gone: { icon: OctagonXIcon, quiet: true },
  evening: { icon: MoonIcon },
  begins: { icon: WaveIcon },
};

const THUMB = 48;

function RowShape({
  icon,
  quiet = false,
  unread,
  label,
  onPress,
  onRead,
  children,
  aside,
}: {
  icon: GlyphIcon;
  quiet?: boolean;
  unread: boolean;
  label: string;
  onPress: () => void;
  onRead: () => void;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <SwipeRow
      leading={
        unread
          ? { label: m.native_mark_read(), icon: CheckIcon, tone: "accent", onAct: onRead }
          : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread ? `${m.alerts_unread()}. ${label}` : label}
        accessibilityActions={unread ? [{ name: "markRead", label: m.native_mark_read() }] : []}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "markRead") onRead();
        }}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "flex-start",
          gap: space.s,
          paddingHorizontal: space.m,
          paddingVertical: space.s,
          minHeight: 44,
          backgroundColor: pressed ? colors["neutral-3"] : colors["cte-surface"],
        })}
      >
        <View style={{ paddingTop: 2 }}>
          <Glyph icon={icon} size={18} color={quiet ? colors["neutral-7"] : colors["neutral-10"]} />
        </View>
        <View style={{ flex: 1, gap: space.xxs }}>{children}</View>
        {aside}
        <UnreadDot unread={unread} />
      </Pressable>
    </SwipeRow>
  );
}

/** What an alert told: its name, its moment, a line for each place, and when. */
export function NotificationRow({
  notification,
  now,
  onOpen,
  onRead,
}: {
  notification: AlertNotification;
  now: number;
  onOpen: () => void;
  onRead: () => void;
}) {
  // A buoy's height and its distance are written in the reader's units.
  useUnits();
  const { moment, payload } = notification;
  const { icon, quiet } = MOMENT_ICONS[moment];
  const unread = notification.readAt === null;
  const title = notificationTitle(notification);
  const lines = payload.lines.map((line) => ({
    key: line.spotId,
    // The evening lists every alert: a line says whose it is, when its alert is not named
    // after its place.
    owner: line.alertName && line.alertName !== line.spotName ? line.alertName : undefined,
    words: lineWords(line, moment, payload.zone),
    buoy: buoyWords(line, payload.zone),
  }));
  const ago = agoWords(notification.createdAt, now);
  const label = [
    title,
    MOMENT_WORDS[moment](),
    ...lines.map((line) => [line.owner, line.words, line.buoy?.said].filter(Boolean).join(", ")),
    ago,
  ].join(". ");

  return (
    <RowShape
      icon={icon}
      quiet={quiet}
      unread={unread}
      label={label}
      onPress={onOpen}
      onRead={onRead}
    >
      <Text weight={unread ? "medium" : "regular"} numberOfLines={2}>
        {title}
      </Text>
      <Text size="s" tone="muted">
        {MOMENT_WORDS[moment]()}
      </Text>
      {lines.map((line) => (
        <View key={line.key} style={{ gap: 2 }}>
          <Text size="s">
            {line.owner ? <Text size="s" tone="muted">{`${line.owner} · `}</Text> : null}
            {line.words}
          </Text>
          {/* What the nearest wave station measured as the window began: the whole sea where it
              stands, given for the reader to judge. */}
          {line.buoy ? (
            <Text size="s" tone="muted">
              {line.buoy.said}
            </Text>
          ) : null}
          {line.buoy?.credit ? (
            <Text size="xs" tone="muted">
              {line.buoy.credit}
            </Text>
          ) : null}
        </View>
      ))}
      <Text size="xs" tone="muted">
        {ago}
      </Text>
    </RowShape>
  );
}

/**
 * A notice of reports: the break, how many reports, and the newest one still shown, with its
 * first photo. Pressed, it opens the break on its reports, whether it was read or not.
 */
export function NoticeRow({
  notice,
  now,
  onOpen,
  onRead,
}: {
  notice: ReportNotice;
  now: number;
  onOpen: () => void;
  onRead: () => void;
}) {
  const { colors, radius } = useTheme();
  const unread = notice.readAt === null;
  const { title, said } = noticeWords(notice);
  const ago = agoWords(notice.updatedAt, now);
  const thumb = notice.latest?.thumb;
  return (
    <RowShape
      icon={CameraIcon}
      unread={unread}
      label={[title, m.notice_label(), said, ago].join(". ")}
      onPress={onOpen}
      onRead={onRead}
      aside={
        thumb ? (
          <Image
            source={{ uri: thumb }}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            transition={150}
            style={{
              width: THUMB,
              height: THUMB,
              borderRadius: Math.min(radius.xs, THUMB / 4),
              backgroundColor: colors["neutral-3"],
            }}
          />
        ) : null
      }
    >
      <Text weight={unread ? "medium" : "regular"} numberOfLines={1}>
        {title}
      </Text>
      <Text size="s" tone="muted">
        {m.notice_label()}
      </Text>
      <Text size="s" tone={notice.latest ? "default" : "muted"} numberOfLines={2}>
        {said}
      </Text>
      <Text size="xs" tone="muted">
        {ago}
      </Text>
    </RowShape>
  );
}
