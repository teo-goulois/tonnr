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
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { formatAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

import { InlineBearing } from "./alert-summary";
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

// A row of what was told, a notification of an alert or a notice of reports, as the web's
// `AlertsPanel` lists them: on the screen's own ground, the sign of its moment, its words, and a
// dot of the accent while it is not read. A notification is pressed to be read, and a read one
// is pressed no more; a notice opens its break. A swipe from the leading edge reads either, a
// shortcut that draws nothing at rest.

// The sign of each moment: decision 031, "The moments". "Gone" is said quieter.
const MOMENT_ICONS: Record<Moment, { icon: GlyphIcon; quiet?: boolean }> = {
  found: { icon: CircleCheckIcon },
  moved: { icon: ClockIcon },
  gone: { icon: OctagonXIcon, quiet: true },
  evening: { icon: MoonIcon },
  begins: { icon: WaveIcon },
};

// A notice's photo, the web's `size-12`.
const THUMB = 48;
// The dot of what is not read, the web's `size-2`.
const DOT = 8;

/** The dot of what is not read, which a screen reader is told in words by its row. */
function UnreadDot() {
  const { colors, space } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        marginTop: space.xs,
        backgroundColor: colors["color-1"],
      }}
    />
  );
}

function RowShape({
  icon,
  quiet = false,
  unread,
  label,
  onPress,
  onSwipeRead,
  onReadAction,
  children,
  aside,
}: {
  icon: GlyphIcon;
  quiet?: boolean;
  unread: boolean;
  label: string;
  /** What a press does. Without it the row cannot be pressed. */
  onPress?: (() => void) | undefined;
  /** Reads it, from a swipe. */
  onSwipeRead?: (() => void) | undefined;
  /** Reads it, from a screen reader's action, where a press does something else. */
  onReadAction?: (() => void) | undefined;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const { colors, space, radius } = useTheme();
  const said = unread ? `${m.alerts_unread()}. ${label}` : label;
  // The web's row: its room laid around its words, its corners the theme's smallest, tinted in
  // the transparent third grey as it is pressed.
  const shape = (pressed: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: space.s,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    minHeight: TARGET,
    borderRadius: radius.xs,
    borderCurve: "continuous" as const,
    backgroundColor: pressed ? colors["neutral-3-transparent"] : undefined,
  });
  const content = (
    <>
      <View style={{ paddingTop: 2 }}>
        <Glyph icon={icon} size={18} color={quiet ? colors["neutral-7"] : colors["neutral-10"]} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>{children}</View>
      {aside}
      {unread ? <UnreadDot /> : null}
    </>
  );
  return (
    <SwipeRow
      leading={
        onSwipeRead
          ? { label: m.native_mark_read(), icon: CheckIcon, tone: "accent", onAct: onSwipeRead }
          : undefined
      }
    >
      {/* The screen's ground, which a swipe moves over what it reveals. */}
      <View style={{ backgroundColor: colors["cte-canvas"] }}>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={said}
            accessibilityActions={
              onReadAction ? [{ name: "markRead", label: m.native_mark_read() }] : []
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "markRead") onReadAction?.();
            }}
            onPress={onPress}
            style={({ pressed }) => shape(pressed)}
          >
            {content}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={said} style={shape(false)}>
            {content}
          </View>
        )}
      </View>
    </SwipeRow>
  );
}

/**
 * What an alert told: its name, its moment, a line for each place, and when. Pressed while it is
 * not read, it is read, which is all there is to do with it, as on the web.
 */
export function NotificationRow({
  notification,
  now,
  onRead,
}: {
  notification: AlertNotification;
  now: number;
  onRead: () => void;
}) {
  // A buoy's height and its distance are written in the reader's units.
  useUnits();
  const { colors, space } = useTheme();
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
  const ago = formatAgo(notification.createdAt, now);
  const label = [
    title,
    MOMENT_WORDS[moment](),
    ...lines.map((line) => [line.owner, line.words, line.buoy?.spoken].filter(Boolean).join(", ")),
    ago,
  ].join(". ");

  return (
    <RowShape
      icon={icon}
      quiet={quiet}
      unread={unread}
      label={label}
      onPress={unread ? onRead : undefined}
      onSwipeRead={unread ? onRead : undefined}
    >
      <Text weight={unread ? "medium" : "regular"} numberOfLines={1}>
        {title}
      </Text>
      <Text size="s" tone="muted">
        {MOMENT_WORDS[moment]()}
      </Text>
      {lines.map((line) => (
        <View key={line.key} style={{ gap: space.xxs }}>
          <Text size="s">
            {line.owner ? <Text size="s" tone="muted">{`${line.owner} · `}</Text> : null}
            {line.words}
          </Text>
          {/* What the nearest wave station measured as the window began: the whole sea where it
              stands, given for the reader to judge. */}
          {line.buoy ? (
            <Text size="s" tone="muted">
              {line.buoy.measured}
              {line.buoy.period === undefined ? "" : ` · ${line.buoy.period}`}
              {line.buoy.direction === undefined ? null : (
                <>
                  {" · "}
                  <InlineBearing degrees={line.buoy.direction} color={colors["neutral-7"]} />
                </>
              )}
              {` · ${line.buoy.at}`}
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
      onSwipeRead={unread ? onRead : undefined}
      onReadAction={unread ? onRead : undefined}
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
              borderRadius: radius.xs,
              borderCurve: "continuous",
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
