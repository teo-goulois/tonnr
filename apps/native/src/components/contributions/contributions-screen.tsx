import type { Standing } from "@repo/client/viewer/types";
import { LogbookIcon } from "@repo/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { RefreshControl, View } from "react-native";

import { rankInitials, RankBadge, rankName } from "@/components/account/rank-badge";
import { Step } from "@/components/account/settings-steps";
import { points, progressOf } from "@/components/guides/guide-words";
import { openBreakGuide } from "@/components/guides/open-guide";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useRequireAccount } from "@/lib/require-account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

import { ContributionRow } from "./contribution-row";

// What an account wrote in the guides and what became of it, with where it stands: its score,
// the rank it reached and how far the next one is, as the web's `ContributionsPanel` says them.
// Decision 041.

/** How far the next rank is, as a bar that a screen reader reads as a progress. */
function Progress({ standing }: { standing: Standing }) {
  const { colors, space } = useTheme();
  const { next, score } = standing;
  const progress = progressOf(score, next);
  if (!next || !progress) {
    return (
      <Text size="s" tone="muted">
        {m.contributions_top()}
      </Text>
    );
  }
  const rank = rankInitials(next.rank);
  const lacking = m.contributions_next({ points: points(progress.lacking), rank });
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={m.contributions_progress({ rank })}
      accessibilityValue={{
        min: 0,
        max: next.from,
        now: Math.min(score, next.from),
        text: lacking,
      }}
      style={{ gap: space.xs }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.s }}>
        <Text size="s">{m.contributions_progress({ rank })}</Text>
        <Text size="s" tone="muted" numeric style={{ flexShrink: 1, textAlign: "right" }}>
          {lacking}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <View
          style={{
            width: `${progress.share * 100}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: colors["color-1"],
          }}
        />
      </View>
    </View>
  );
}

/** Where the account stands: its points, its rank, and the way to the next one. */
function StandingCard({ standing }: { standing: Standing }) {
  const { space } = useTheme();
  return (
    <Surface style={{ padding: space.m, gap: space.s }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s }}>
        <Text size="l" weight="medium" numeric>
          {points(standing.score)}
        </Text>
        {standing.rank ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <RankBadge rank={standing.rank} />
            <Text size="s" tone="muted">
              {rankName(standing.rank)}
            </Text>
          </View>
        ) : (
          <Text size="s" tone="muted">
            {m.contributions_no_rank()}
          </Text>
        )}
      </View>
      <Progress standing={standing} />
      <Text size="s" tone="muted">
        {m.contributions_scale()}
      </Text>
      {standing.sponsorships > 0 ? (
        <Text size="s">
          {standing.sponsorships === 1
            ? m.contributions_sponsorships_one()
            : m.contributions_sponsorships({ count: standing.sponsorships })}
        </Text>
      ) : null}
      {standing.trusted ? <Text size="s">{m.contributions_trusted()}</Text> : null}
    </Surface>
  );
}

/**
 * One step into the account's tab: what the account wrote of the breaks, each opening its guide
 * on the map, and where it stands.
 */
export function ContributionsScreen() {
  const { space } = useTheme();
  const { signedIn, pending, userId } = useAccount();
  const requireAccount = useRequireAccount();
  const standing = useQuery(
    orpc.v1.contributions.mine.queryOptions({
      queryKey: [...orpc.v1.contributions.mine.queryKey(), userId],
      enabled: signedIn,
    }),
  );
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await standing.refetch().catch(() => {});
    setRefreshing(false);
  };

  if (!signedIn) {
    return (
      <Step title={m.contributions_title()}>
        {pending ? null : (
          <EmptyState
            icon={LogbookIcon}
            title={m.contributions_title()}
            description={m.contributions_hint()}
            action={{
              label: m.auth_sign_in(),
              onPress: () => requireAccount(m.contributions_hint(), () => {}),
            }}
          />
        )}
      </Step>
    );
  }

  const known = standing.data;
  return (
    <Step
      title={m.contributions_title()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      {known ? (
        <>
          <StandingCard standing={known} />
          {known.contributions.length === 0 ? (
            <Surface>
              <EmptyState icon={LogbookIcon} title={m.contributions_empty()} />
            </Surface>
          ) : (
            <Surface insetEdge style={{ overflow: "hidden" }}>
              {known.contributions.map((one, index) => (
                <Fragment key={one.id}>
                  {index > 0 ? <Separator inset={space.m} /> : null}
                  <ContributionRow
                    one={one}
                    status={one.status}
                    reason={one.reason}
                    onOpenBreak={openBreakGuide}
                  />
                </Fragment>
              ))}
            </Surface>
          )}
        </>
      ) : standing.isError ? (
        <ErrorState
          title={m.contributions_failed()}
          onRetry={() => void standing.refetch()}
          retrying={standing.isRefetching}
        />
      ) : (
        <Loading>
          <View style={{ gap: space.s }}>
            <Skeleton height={140} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        </Loading>
      )}
    </Step>
  );
}
