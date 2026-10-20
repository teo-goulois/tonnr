import { isCounted, reportParts } from "@repo/client/reports/parts";
import type { Report } from "@repo/client/reports/types";
import { CameraIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { RefreshControl, SectionList, type ListViewToken, View } from "react-native";

import { ReportCard } from "@/components/reports/report-card";
import { reportCounter } from "@/components/reports/report-counter";
import { useBreakReports, useReportWrites } from "@/components/reports/use-reports";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

// Another's report that is shown is counted once this phone has had half of it in view a second
// without a pause: decision 068. The reader's own, and one that is not shown, are not.
const SEEN = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 };

type Part = { title: string; data: Report[] };

/** What a press on a report's photo does: it is counted opened, then shown over the whole screen. */
function openShot(report: Report, mediaId: string) {
  if (isCounted(report)) reportCounter().opened(report.id);
  router.push({
    pathname: "/media/[id]",
    params: { id: mediaId, break: report.breakId, report: report.id },
  });
}

/** The reports of a break: what accounts showed of its waves lately. */
function BreakReports({ breakId }: { breakId: string }) {
  const { colors, space } = useTheme();
  const { signedIn } = useAccount();
  const requireAccount = useRequireAccount();
  const reports = useBreakReports(breakId);
  const writes = useReportWrites();
  const [now, setNow] = useState(Date.now);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // The reports of the last hours first, then those of the week.
  const parts = useMemo<Part[]>(() => {
    const split = reportParts(reports.data?.reports ?? [], now);
    return [
      { title: m.reports_now(), data: split.now },
      { title: m.reports_week(), data: split.week },
    ].filter((part) => part.data.length > 0);
  }, [reports.data, now]);

  // The list asks for one function all its life.
  const onSeen = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    for (const token of viewableItems) {
      const report = token.item as Report | undefined;
      if (token.isViewable && report && "id" in report && isCounted(report)) {
        reportCounter().seen(report.id);
      }
    }
  }).current;

  async function refresh() {
    setIsRefreshing(true);
    setNow(Date.now());
    await reports.refetch().finally(() => setIsRefreshing(false));
  }

  const send = () =>
    requireAccount(m.report_sign_in_prompt(), () =>
      router.push({ pathname: "/report/new", params: { break: breakId } }),
    );
  const offered = reports.data?.offered !== false;

  return (
    <SectionList
      style={{ flex: 1 }}
      nestedScrollEnabled
      sections={parts}
      keyExtractor={(report) => report.id}
      stickySectionHeadersEnabled={false}
      viewabilityConfig={SEEN}
      onViewableItemsChanged={onSeen}
      contentContainerStyle={{ padding: space.m, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: space.s, paddingBottom: space.l }}>
          <Text size="s" tone="muted">
            {m.reports_intro()}
          </Text>
          {signedIn ? (
            offered ? (
              <Button
                variant="secondary"
                icon={CameraIcon}
                onPress={send}
                style={{ alignSelf: "flex-start" }}
              >
                {m.report_send()}
              </Button>
            ) : null
          ) : (
            <View style={{ gap: space.xs }}>
              <Text size="s" tone="muted">
                {m.report_sign_in_prompt()}
              </Text>
              <Button variant="secondary" onPress={send} style={{ alignSelf: "flex-start" }}>
                {m.auth_sign_in()}
              </Button>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        reports.isError ? (
          <ErrorState
            title={m.reports_load_failed()}
            onRetry={() => void reports.refetch()}
            retrying={reports.isFetching}
          />
        ) : !reports.data ? (
          <Loading>
            <View style={{ gap: space.s }}>
              <Skeleton height={16} width="40%" />
              <View style={{ flexDirection: "row", gap: space.xs }}>
                <Skeleton height={96} width={96} />
                <Skeleton height={96} width={96} />
              </View>
            </View>
          </Loading>
        ) : (
          <Text size="s" tone="muted">
            {m.reports_empty()}
          </Text>
        )
      }
      renderSectionHeader={({ section }) => (
        <Text weight="medium" accessibilityRole="header" style={{ paddingBottom: space.s }}>
          {section.title}
        </Text>
      )}
      SectionSeparatorComponent={() => <View style={{ height: space.xs }} />}
      ItemSeparatorComponent={() => (
        <View style={{ paddingVertical: space.m }}>
          <Separator />
        </View>
      )}
      renderSectionFooter={() => <View style={{ height: space.l }} />}
      renderItem={({ item }) => (
        <ReportCard
          report={item}
          now={now}
          signedIn={signedIn}
          onOpen={(report, shot) => openShot(report, shot.id)}
          onDelete={(report) => void writes.remove(report)}
          onFlag={(report, reason) => void writes.flag(report, reason)}
          onBlock={(username) => void writes.block(username)}
        />
      )}
    />
  );
}

/**
 * The reports of the waves at a break, the tab after its forecast: what accounts showed of it in
 * the last hours, then in the week, in photos and videos checked to be of there, of now and of
 * the sea, each counted seen as it shows and opened as its photo opens. A visitor reads them, and
 * an account sends one. The web's `ReportsPanel` shows the same. Decisions 067 and 068.
 */
export function ReportsTab({ kind, id }: PlaceTabProps) {
  if (kind !== "break") return null;
  return <BreakReports key={id} breakId={id} />;
}
