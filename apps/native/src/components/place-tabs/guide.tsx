import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";

import { BreakGuide, GuideSkeleton } from "@/components/guides/break-guide";
import { useGuiding } from "@/components/guides/use-guiding";
import { ErrorState } from "@/components/ui/error-state";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export type PlaceTabProps = { kind: "break" | "station" | "spot"; id: string };

/**
 * The guide of a surf break, written by the accounts (decision 041): the tab of a break's sheet
 * that reads and completes it. Only a break of the catalogue has one. It is drawn in the sheet's
 * own scroll, and scrolls with it.
 */
export function GuideTab({ kind, id }: PlaceTabProps) {
  if (kind !== "break") return null;
  return <BreakGuideTab id={id} />;
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
