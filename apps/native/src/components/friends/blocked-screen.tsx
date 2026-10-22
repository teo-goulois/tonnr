import type { BlockedAccount } from "@repo/client/viewer/types";
import { XIcon } from "@repo/ui/icon";
import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Step } from "@/components/account/settings-steps";
import { SwipeRow } from "@/components/alerts/swipe-row";
import { AccountPrompt } from "@/components/auth/account-prompt";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { TARGET } from "@/components/ui/metrics";
import { Loading, Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { useBlockedAccounts } from "./blocking";

// The accounts the signed-in account blocked, one step into its tab, each with what lifts the
// block, as the web's `BlockedAccounts` lists them on the screen's own ground: decision 071. A
// block is lifted by its own id, and the list names the account by the username it was blocked
// under.

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
  return (
    // A swipe from the trailing edge does what the button beside the name does, which a screen
    // reader reaches. Lifting a block takes nothing away: it is drawn in the accent.
    <SwipeRow
      trailing={{
        label: m.block_unblock(),
        icon: XIcon,
        tone: "accent",
        onAct: () => {
          if (lifting === undefined) onUnblock();
        },
      }}
    >
      <View
        style={{
          // The screen's own ground, over the action that the swipe uncovers behind it.
          backgroundColor: colors["cte-canvas"],
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.s,
          minHeight: TARGET,
        }}
      >
        {/* The name it was blocked under, which the list keeps whatever it takes later. */}
        <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
          {`@${one.username}`}
        </Text>
        <Button
          variant="outline"
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

/**
 * One step into the account's tab: the accounts it blocked, and what lifts each block. A visitor
 * is asked for an account, and comes back here once signed in.
 */
export function BlockedScreen() {
  const { colors, space } = useTheme();
  const { signedIn, pending } = useAccount();
  const { list, lifting, unblock } = useBlockedAccounts();
  const [refreshing, setRefreshing] = useState(false);
  const blocks = list.data;

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch().catch(() => {});
    setRefreshing(false);
  };

  if (!signedIn) {
    return (
      <Step title={m.blocks_title()}>
        {pending ? null : (
          <AccountPrompt text={m.account_sign_in_prompt()} next="/account/blocked" />
        )}
      </Step>
    );
  }

  return (
    <Step
      title={m.blocks_title()}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors["neutral-7"]}
        />
      }
    >
      <Text size="s" tone="muted">
        {m.blocks_intro()}
      </Text>
      {blocks ? (
        blocks.length === 0 ? (
          <Text size="s" tone="muted">
            {m.blocks_empty()}
          </Text>
        ) : (
          <View style={{ gap: space.xs }}>
            {blocks.map((one) => (
              <BlockedRow key={one.id} one={one} lifting={lifting} onUnblock={() => unblock(one)} />
            ))}
          </View>
        )
      ) : list.isError ? (
        <ErrorState
          plain
          title={m.blocks_failed()}
          onRetry={() => void list.refetch()}
          retrying={list.isRefetching}
        />
      ) : (
        <Loading>
          <Skeleton height={TARGET} />
        </Loading>
      )}
    </Step>
  );
}
