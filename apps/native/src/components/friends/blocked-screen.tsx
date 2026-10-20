import type { BlockedAccount } from "@repo/client/viewer/types";
import { PersonIcon } from "@repo/ui/icon";
import { Fragment, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TARGET } from "@/components/ui/metrics";
import { Separator } from "@/components/ui/separator";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { formatDate } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { useBlockedAccounts } from "./blocking";
import { SwipeRow } from "./swipe-row";

// The accounts the signed-in account blocked, one step into its tab, each with what lifts the
// block, as the web's `BlockedAccounts` lists them: decision 071. A block is lifted by its own
// id, and the list names the account by the username it was blocked under.

function BlockedRow({
  one,
  lifting,
  onUnblock,
}: {
  one: BlockedAccount;
  lifting: string | undefined;
  onUnblock: () => void;
}) {
  const { space } = useTheme();
  const actions = [{ label: m.block_unblock(), onPress: onUnblock }];
  const since = m.native_blocked_since({ date: formatDate(one.since) });
  return (
    // The swipe does what the button beside the name does: a screen reader reaches the button.
    <SwipeRow actions={actions}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          minHeight: TARGET,
          paddingStart: space.m,
          paddingEnd: space.xs,
          paddingVertical: space.xs,
        }}
      >
        <View accessible accessibilityLabel={`@${one.username}, ${since}`} style={{ flex: 1 }}>
          {/* The name it was blocked under, which the list keeps whatever it takes later. */}
          <Text weight="medium" numberOfLines={1}>
            {`@${one.username}`}
          </Text>
          <Text size="s" tone="muted">
            {since}
          </Text>
        </View>
        <Button
          variant="secondary"
          loading={lifting === one.id}
          disabled={lifting !== undefined}
          onPress={onUnblock}
        >
          {m.block_unblock()}
        </Button>
      </View>
    </SwipeRow>
  );
}

/** One step into the account's tab: the accounts it blocked, and what lifts each block. */
export function BlockedScreen() {
  const { space } = useTheme();
  const { signedIn } = useAccount();
  const { list, lifting, unblock } = useBlockedAccounts();
  const [refreshing, setRefreshing] = useState(false);
  const blocks = list.data;

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch().catch(() => {});
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        signedIn ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        ) : undefined
      }
      contentContainerStyle={{ gap: space.m, padding: space.m, paddingBottom: space.xxl }}
    >
      <Text size="s" tone="muted" style={{ paddingHorizontal: space.m }}>
        {m.blocks_intro()}
      </Text>
      {!signedIn ? null : blocks ? (
        blocks.length === 0 ? (
          <Surface>
            <EmptyState icon={PersonIcon} title={m.blocks_empty()} />
          </Surface>
        ) : (
          <Surface insetEdge style={{ overflow: "hidden" }}>
            {blocks.map((one, index) => (
              <Fragment key={one.id}>
                {index > 0 ? <Separator inset={space.m} /> : null}
                <BlockedRow one={one} lifting={lifting} onUnblock={() => unblock(one)} />
              </Fragment>
            ))}
          </Surface>
        )
      ) : list.isError ? (
        <ErrorState
          title={m.blocks_failed()}
          onRetry={() => void list.refetch()}
          retrying={list.isRefetching}
        />
      ) : (
        <Loading>
          <View style={{ gap: space.xs }}>
            <Skeleton height={TARGET} />
            <Skeleton height={TARGET} />
          </View>
        </Loading>
      )}
    </ScrollView>
  );
}
