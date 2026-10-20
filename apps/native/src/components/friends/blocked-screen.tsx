import type { BlockedAccount } from "@repo/client/viewer/types";
import { PersonIcon, XIcon } from "@repo/ui/icon";
import { Fragment, useState } from "react";
import { RefreshControl, View } from "react-native";

import { Step } from "@/components/account/settings-steps";
import { SwipeRow } from "@/components/alerts/swipe-row";
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
  const { colors, space } = useTheme();
  const since = m.native_blocked_since({ date: formatDate(one.since) });
  return (
    // A swipe from the trailing edge does what the button beside the name does, which a screen
    // reader reaches.
    <SwipeRow
      trailing={{
        label: m.block_unblock(),
        icon: XIcon,
        tone: "danger",
        onAct: () => {
          if (lifting === undefined) onUnblock();
        },
      }}
    >
      <View
        style={{
          // The row's own ground, over the action that the swipe uncovers behind it.
          backgroundColor: colors["cte-surface"],
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
    <Step
      title={m.blocks_title()}
      refreshControl={
        signedIn ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        ) : undefined
      }
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
    </Step>
  );
}
