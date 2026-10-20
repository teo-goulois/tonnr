import {
  FLAG_REASONS,
  type FlagReason,
  type Report,
  type ReportReason,
} from "@repo/client/reports/types";
import type { MediaItem } from "@repo/client/viewer/types";
import { MoreHorizontalIcon } from "@repo/ui/icon";
import MenuView, { type MenuAction } from "@expo/ui/community/menu";
import { Spinner } from "heroui-native";
import { ActionSheetIOS, Alert, Platform, ScrollView, View } from "react-native";

import { MediaTile } from "@/components/media/media-tile";
import { Glyph } from "@/components/shared/glyph";
import { sizesWords } from "@/components/sessions/surf-size";
import { feel } from "@/components/ui/haptics";
import { TARGET } from "@/components/ui/metrics";
import { Text } from "@/components/ui/text";
import { formatAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { formatDistance, useUnits } from "@/lib/units";
import { m } from "@/paraglide/messages";

// A report of the waves at a break: who sent it and when, from how far, its photos and videos, how
// big the waves looked and a few words, as the web's `ReportCard` shows it. Its menu is the
// platform's own: its author deletes it, anyone else flags it or blocks its author. What its author
// alone reads of it, where it stands and how many saw it, is under it. Decisions 067, 068 and 071.

const SHOT = 96;

/** Why a medium of a report is not shown, in the words of its author. */
export function reasonWords(reason: ReportReason, distanceKm: number | null) {
  switch (reason) {
    case "no_position":
      return m.report_reason_no_position();
    case "too_far":
      return distanceKm === null
        ? m.report_reason_far()
        : m.report_reason_too_far({ distance: formatDistance(distanceKm) });
    case "imprecise":
      return m.report_reason_imprecise();
    case "no_time":
      return m.report_reason_no_time();
    case "too_old":
      return m.report_reason_too_old();
    case "ahead":
      return m.report_reason_ahead();
    case "not_sea":
      return m.report_reason_not_sea();
    case "nudity":
      return m.report_reason_nudity();
    case "unsure":
      return m.report_reason_unsure();
    case "unreadable":
      return m.report_reason_unreadable();
  }
}

const FLAG_WORDS: Record<FlagReason, () => string> = {
  not_here: m.report_flag_not_here,
  not_now: m.report_flag_not_now,
  not_sea: m.report_flag_not_sea,
  offensive: m.report_flag_offensive,
  other: m.report_flag_other,
};

/** Asks one question the platform's way, with one destructive answer. True when it was given. */
export function confirmDestructive(title: string, message: string, confirm: string) {
  feel("warn");
  return new Promise<boolean>((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirm, m.action_cancel()],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => resolve(index === 0),
      );
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: m.action_cancel(), style: "cancel", onPress: () => resolve(false) },
        { text: confirm, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Asks why a report should not be shown, among the reasons the API takes. */
export function askFlagReason() {
  return new Promise<FlagReason | null>((resolve) => {
    const words = FLAG_REASONS.map((reason) => FLAG_WORDS[reason]());
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: m.report_flag(),
          options: [...words, m.action_cancel()],
          cancelButtonIndex: words.length,
        },
        (index) => resolve(FLAG_REASONS[index] ?? null),
      );
      return;
    }
    Alert.alert(
      m.report_flag(),
      undefined,
      [
        ...FLAG_REASONS.map((reason, index) => ({
          text: words[index] ?? reason,
          onPress: () => resolve(reason),
        })),
        { text: m.action_cancel(), style: "cancel" as const, onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

/** What the author of a report reads of it, and nobody else. Decision 068. */
export function ReportStats({ stats }: { stats: NonNullable<Report["stats"]> }) {
  const { views, opens, told } = stats;
  return (
    <Text size="xs" tone="muted" numeric>
      {[
        views === 1 ? m.report_views_one() : m.report_views({ count: views }),
        opens === 1 ? m.report_opens_one() : m.report_opens({ count: opens }),
        told === 1 ? m.report_told_one() : m.report_told({ count: told }),
        m.report_stats_private(),
      ].join(" · ")}
    </Text>
  );
}

/** Where a report of the reader's stands, when it is not shown to everyone. */
function OwnState({ report }: { report: Report }) {
  const { colors, space } = useTheme();
  if (report.state === "published") return null;
  if (report.state === "checking") {
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
      >
        <Spinner size="sm" color={colors["neutral-7"]} />
        <Text size="s" tone="muted">
          {m.report_checking()}
        </Text>
      </View>
    );
  }
  if (report.state === "review") {
    return (
      <Text size="s" tone="muted">
        {m.report_review()}
      </Text>
    );
  }
  if (report.state === "hidden") {
    return (
      <Text size="s" tone="muted">
        {m.report_hidden()}
      </Text>
    );
  }
  return (
    <View style={{ gap: space.xxs }}>
      <Text size="s" weight="medium">
        {m.report_refused()}
      </Text>
      {report.reasons.map((reason) => (
        <Text key={reason} size="s" tone="muted">
          {`• ${reasonWords(reason, report.distanceKm)}`}
        </Text>
      ))}
    </View>
  );
}

type ReportCardProps = {
  report: Report;
  now: number;
  signedIn: boolean;
  onOpen: (report: Report, item: MediaItem) => void;
  onDelete: (report: Report) => void;
  onFlag: (report: Report, reason: FlagReason) => void;
  // Blocks the author of another's report, by its username, once asked: decision 071.
  onBlock: (username: string) => void;
};

/** A report: who sent it and when, from how far, its photos, how big it looked, and a few words. */
export function ReportCard({
  report,
  now,
  signedIn,
  onOpen,
  onDelete,
  onFlag,
  onBlock,
}: ReportCardProps) {
  useUnits();
  const { colors, space } = useTheme();
  const author = report.author ?? m.report_someone();
  const sizes = sizesWords(report.waveSize, report.setSize);
  const when =
    now - report.createdAt.getTime() < 60_000
      ? m.report_just_now()
      : formatAgo(report.createdAt, now);
  const from =
    report.distanceKm === null
      ? null
      : m.report_from({ distance: formatDistance(report.distanceKm, 1) });

  // What the menu offers: the author deletes; anyone else flags it, once, or blocks its author.
  const actions: MenuAction[] = report.mine
    ? [
        {
          id: "delete",
          title: m.report_delete(),
          image: "trash",
          attributes: { destructive: true },
        },
      ]
    : [
        report.flagged
          ? {
              id: "flagged",
              title: m.report_flag_done(),
              image: "flag.fill",
              attributes: { disabled: true },
            }
          : {
              id: "flag",
              title: m.report_flag(),
              image: "flag",
              subactions: FLAG_REASONS.map((reason) => ({
                id: `flag:${reason}`,
                title: FLAG_WORDS[reason](),
              })),
            },
        // An author with no name is blocked by none.
        ...(report.author
          ? [
              {
                id: "block",
                title: m.block_account({ username: report.author }),
                image: "hand.raised" as const,
                attributes: { destructive: true },
              },
            ]
          : []),
      ];

  const act = async (id: string) => {
    if (id === "delete") {
      if (
        await confirmDestructive(
          m.report_delete(),
          m.native_report_delete_message(),
          m.action_delete(),
        )
      ) {
        onDelete(report);
      }
      return;
    }
    if (id === "flag") {
      const reason = await askFlagReason();
      if (reason) onFlag(report, reason);
      return;
    }
    if (id.startsWith("flag:")) {
      const reason = FLAG_REASONS.find((one) => `flag:${one}` === id);
      if (reason) onFlag(report, reason);
      return;
    }
    if (id === "block" && report.author) onBlock(report.author);
  };

  // A screen reader finds what the menu offers among the actions of the card's first line.
  const spoken = [
    ...(report.mine ? [{ name: "delete", label: m.report_delete() }] : []),
    ...(!report.mine && !report.flagged ? [{ name: "flag", label: m.report_flag() }] : []),
    ...(!report.mine && report.author
      ? [{ name: "block", label: m.block_account({ username: report.author }) }]
      : []),
  ];

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <View
          accessible
          accessibilityLabel={[author, when, from].filter(Boolean).join(", ")}
          accessibilityActions={signedIn ? spoken : undefined}
          onAccessibilityAction={(event) => void act(event.nativeEvent.actionName)}
          style={{ flex: 1, flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}
        >
          <Text size="s" weight="medium" numberOfLines={1}>
            {author}
          </Text>
          <Text size="s" tone="muted" numeric numberOfLines={1} style={{ flexShrink: 1 }}>
            {` · ${when}${from ? ` · ${from}` : ""}`}
          </Text>
        </View>
        {signedIn ? (
          <MenuView
            title={m.report_menu({ author })}
            actions={actions}
            onPressAction={({ nativeEvent }) => void act(nativeEvent.event)}
          >
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel={m.report_menu({ author })}
              accessibilityHint={m.native_report_menu_hint()}
              style={{
                width: TARGET,
                height: TARGET,
                alignItems: "center",
                justifyContent: "center",
                marginVertical: -space.xs,
              }}
            >
              <Glyph icon={MoreHorizontalIcon} size={18} color={colors["neutral-7"]} />
            </View>
          </MenuView>
        ) : null}
      </View>

      {report.media.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={m.report_viewer_title()}
          style={{ marginHorizontal: -space.m, flexGrow: 0 }}
          contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.m }}
        >
          {report.media.map((item) => (
            <MediaTile
              key={item.id}
              size={SHOT}
              uri={item.thumb}
              recyclingKey={item.id}
              video={item.kind === "video"}
              durationMs={item.durationMs}
              cover={item.state === "ready" ? null : { state: "processing" }}
              onOpen={item.state === "ready" ? () => onOpen(report, item) : undefined}
            />
          ))}
        </ScrollView>
      ) : null}

      {sizes ? <Text size="s">{sizes}</Text> : null}
      {report.note ? <Text size="s">{report.note}</Text> : null}
      {report.mine ? <OwnState report={report} /> : null}
      {report.mine && report.state === "published" && report.stats ? (
        <ReportStats stats={report.stats} />
      ) : null}
    </View>
  );
}
