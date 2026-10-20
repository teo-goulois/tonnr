import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { BreakGuide, GuideSkeleton } from "@/components/guides/break-guide";
import { SpotGuide } from "@/components/guides/spot-guide";
import { useGuiding } from "@/components/guides/use-guiding";
import { ErrorState } from "@/components/ui/error-state";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/**
 * The guide of a place, drawn in the sheet's own scroll: of a surf break, what the accounts
 * write of it (decision 041), which this tab reads and completes; of a spot, what its owner says
 * it is like (decision 006). A station has none.
 */
export function GuideTab({ kind, id }: PlaceTabProps) {
  if (kind === "break") return <BreakGuideTab id={id} />;
  if (kind === "spot") return <SpotGuideTab id={id} />;
  return null;
}

function SpotGuideTab({ id }: { id: string }) {
  const { space } = useTheme();
  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: space.l }}>
      <SpotGuide id={id} />
    </View>
  );
}

function BreakGuideTab({ id }: { id: string }) {
  const { space } = useTheme();
  const found = useQuery(orpc.v1.breaks.get.queryOptions({ input: { id } }));
  const { guide, own, actions } = useGuiding(id);

  return (
    <View style={{ paddingHorizontal: space.m, paddingVertical: space.l }}>
      {found.data ? (
        <BreakGuide found={found.data} guide={guide} own={own} actions={actions} />
      ) : found.isError ? (
        <ErrorState
          title={m.native_guide_failed()}
          onRetry={() => void found.refetch()}
          retrying={found.isRefetching}
        />
      ) : (
        <GuideSkeleton />
      )}
    </View>
  );
}
