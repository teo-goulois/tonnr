import type { Standing } from "@repo/client/viewer/types";
import { useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { rankInitials, RankBadge, rankName } from "@/components/account/rank-badge";
import { Step } from "@/components/account/settings-steps";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { points, progressOf } from "@/components/guides/guide-words";
import { openBreakGuide } from "@/components/guides/open-guide";
import { ErrorState } from "@/components/ui/error-state";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { ContributionRow } from "./contribution-row";
import { useStanding } from "./use-standing";

// What an account wrote in the guides and what became of it, with where it stands: its score,
// the rank it reached and how far the next one is, as the web's `ContributionsPanel` draws them,
// on the screen's own ground. Decision 041.

/** The track's height, the web's `h-1.5`. */
const TRACK = 6;

/**
 * How full the way to the next rank is, in the theme's accent: it eases to a new figure on the
 * theme's large motion, as the web's meter does, and stands still for a reader who asked for no
 * motion, as Reanimated's timing does by default.
 */
function MeterIndicator({ share }: { share: number }) {
  const { colors, motion } = useTheme();
  const shown = useSharedValue(share);
  useEffect(() => {
    const [x1, y1, x2, y2] = motion.largeEasing;
    shown.set(
      withTiming(share, { duration: motion.largeDuration, easing: Easing.bezier(x1, y1, x2, y2) }),
    );
  }, [share, shown, motion]);
  const width = useAnimatedStyle(() => ({ width: `${shown.get() * 100}%` }));
  return (
    <Animated.View
      style={[
        { height: "100%", borderRadius: TRACK / 2, backgroundColor: colors["color-1"] },
        width,
      ]}
    />
  );
}

/** How far the next rank is, as the web's `Meter`, which a screen reader reads as a progress. */
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: space.s,
        }}
      >
        <Text size="s" weight="medium">
          {m.contributions_progress({ rank })}
        </Text>
        <Text size="s" tone="muted" numeric style={{ flexShrink: 1, textAlign: "right" }}>
          {lacking}
        </Text>
      </View>
      <View
        style={{
          height: TRACK,
          borderRadius: TRACK / 2,
          overflow: "hidden",
          backgroundColor: colors["neutral-3"],
        }}
      >
        <MeterIndicator share={progress.share} />
      </View>
    </View>
  );
}

/** Where the account stands: its points, its rank, and the way to the next one. */
function StandingPart({ standing }: { standing: Standing }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: space.s,
          rowGap: space.xxs,
        }}
      >
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
    </View>
  );
}

/** The standing to come, as the web's: a block, then two lines. */
function StandingSkeleton() {
  const { space } = useTheme();
  return (
    <Loading>
      <View style={{ gap: space.s }}>
        <Skeleton height={64} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </View>
    </Loading>
  );
}

/**
 * One step into the account's tab: where the account stands, then what it wrote of the breaks,
 * a step apart, each break's name opening its guide on the map. A pull reads them again, as a
 * phone's lists do. A visitor is asked for an account, as the web's account panel asks, which
 * comes back here.
 */
export function ContributionsScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const standing = useStanding();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await standing.refetch().catch(() => {});
    setRefreshing(false);
  };

  if (!signedIn) {
    return (
      <Step title={m.contributions_title()}>
        {pending ? (
          <StandingSkeleton />
        ) : (
          <AccountPrompt text={m.account_sign_in_prompt()} next="/account/contributions" />
        )}
      </Step>
    );
  }

  const known = standing.data;
  return (
    <Step
      title={m.contributions_title()}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      {known ? (
        <>
          <StandingPart standing={known} />
          {known.contributions.length === 0 ? (
            <Text size="s" tone="muted">
              {m.contributions_empty()}
            </Text>
          ) : (
            <View style={{ gap: space.m }}>
              {known.contributions.map((one) => (
                <ContributionRow key={one.id} one={one} onOpenBreak={openBreakGuide} />
              ))}
            </View>
          )}
        </>
      ) : standing.isError ? (
        <ErrorState
          plain
          title={m.contributions_failed()}
          onRetry={() => void standing.refetch()}
          retrying={standing.isRefetching}
        />
      ) : (
        <StandingSkeleton />
      )}
    </Step>
  );
}
