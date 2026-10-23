import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BreakGuide, GuideSkeleton } from "@/components/guides/break-guide";
import { SpotGuide } from "@/components/guides/spot-guide";
import { useGuiding } from "@/components/guides/use-guiding";
import { ErrorState } from "@/components/ui/error-state";
import { FormScroll } from "@/components/ui/form";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/**
 * The guide of a place, in a scroll view of its own under the sheet's head, as the other tabs of
 * a place's sheet are, and pulled to be read again: of a surf break, what the accounts write of
 * it (decision 041), which this tab reads and completes; of a spot, what its owner says it is
 * like (decision 006). A station has none.
 */
export function GuideTab({ kind, id }: PlaceTabProps) {
  if (kind === "break") return <BreakGuideTab id={id} />;
  if (kind === "spot") return <SpotGuideTab id={id} />;
  return null;
}

/**
 * What the guide scrolls in: within the sheet's padding, as far under the head as the other
 * tabs stand, and clear of the phone's bottom edge once it is read to its end. Its editors unfold
 * in it, so it is a form's scroll view: what is written in stays above the keyboard, and a group
 * of words that is wrong once sent is scrolled to.
 */
function GuideScroll({
  onRefresh,
  children,
}: {
  // Reads again what the tab shows, as a pull does.
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    await onRefresh().finally(() => setIsRefreshing(false));
  };
  return (
    <FormScroll
      style={{ flex: 1 }}
      nestedScrollEnabled
      contentContainerStyle={{
        paddingHorizontal: space.m,
        paddingTop: space.m,
        paddingBottom: insets.bottom + space.xl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      {children}
    </FormScroll>
  );
}

function SpotGuideTab({ id }: { id: string }) {
  const queryClient = useQueryClient();
  // A spot of the account's own is asked for again; one read in a list someone shared is that
  // list's, which this tab does not ask for.
  const refresh = () =>
    queryClient.refetchQueries({
      queryKey: orpc.v1.spots.get.queryKey({ input: { id } }),
      type: "active",
    });
  return (
    <GuideScroll onRefresh={refresh}>
      <SpotGuide key={id} id={id} />
    </GuideScroll>
  );
}

function BreakGuideTab({ id }: { id: string }) {
  const found = useQuery(orpc.v1.breaks.get.queryOptions({ input: { id } }));
  const { guide, own, actions, refresh } = useGuiding(id);

  return (
    // A list of words that was confirmed is what the break says: it is read again with its guide.
    <GuideScroll onRefresh={() => Promise.all([refresh(), found.refetch()])}>
      {found.data ? (
        <BreakGuide key={id} found={found.data} guide={guide} own={own} actions={actions} />
      ) : found.isError ? (
        <ErrorState
          title={m.native_guide_failed()}
          onRetry={() => void found.refetch()}
          retrying={found.isRefetching}
        />
      ) : (
        <GuideSkeleton />
      )}
    </GuideScroll>
  );
}
