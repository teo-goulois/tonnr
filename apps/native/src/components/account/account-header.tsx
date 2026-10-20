import type { Rank } from "@repo/client/viewer/types";
import { CircleCheckIcon, PersonIcon } from "@repo/ui/icon";
import { router } from "expo-router";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { RankBadge } from "./rank-badge";

const AVATAR = 56;

/** The account's initial on a round tile, as a phone's settings open on who is signed in. */
function Avatar({ name }: { name: string | undefined }) {
  const { colors } = useTheme();
  const initial = name?.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors["neutral-3"],
      }}
    >
      {initial ? (
        <Text size="l" weight="medium" dense>
          {initial}
        </Text>
      ) : (
        <Glyph icon={PersonIcon} size={24} color={colors["neutral-7"]} />
      )}
    </View>
  );
}

type SignedIn = {
  username: string | null;
  email: string;
  rank: Rank | null | undefined;
  // Undefined on an instance that does not check addresses.
  checked: boolean | undefined;
};

/**
 * Who is signed in, at the top of the account's tab: the name others read and the rank reached,
 * the address and whether it is checked, with the mail that checks it again. A visitor reads what
 * an account is for, and the two ways in. Decisions 026, 040 and 041.
 */
export function AccountHeader({
  account,
  isPending,
  onSendCheck,
  isSendingCheck,
}: {
  // Undefined for a visitor.
  account: SignedIn | undefined;
  isPending: boolean;
  onSendCheck: () => void;
  isSendingCheck: boolean;
}) {
  const { colors, space, radius } = useTheme();

  if (isPending) {
    return (
      <Surface style={{ flexDirection: "row", gap: space.m, padding: space.m }}>
        <Skeleton width={AVATAR} height={AVATAR} round />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <SkeletonText lines={2} />
        </View>
      </Surface>
    );
  }

  if (!account) {
    return (
      <Surface style={{ gap: space.m, padding: space.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
          <Avatar name={undefined} />
          <Text style={{ flex: 1 }}>{m.account_sign_in_prompt()}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          <Button onPress={() => router.push("/sign-in")} style={{ flexGrow: 1 }}>
            {m.auth_sign_in()}
          </Button>
          <Button
            variant="secondary"
            onPress={() => router.push({ pathname: "/sign-in", params: { mode: "sign-up" } })}
            style={{ flexGrow: 1 }}
          >
            {m.auth_create_account()}
          </Button>
        </View>
      </Surface>
    );
  }

  const name = account.username ? `@${account.username}` : account.email;
  return (
    <Surface style={{ gap: space.s, padding: space.m }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
        <Avatar name={name} />
        <View style={{ flex: 1, gap: space.xxs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Text
              size="l"
              weight="medium"
              numberOfLines={1}
              accessibilityRole="header"
              style={{ flexShrink: 1 }}
            >
              {name}
            </Text>
            {account.rank ? <RankBadge rank={account.rank} /> : null}
          </View>
          {account.username ? (
            <Text size="s" tone="muted" numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
          {account.checked === true ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
              <Glyph icon={CircleCheckIcon} size={14} color={colors["neutral-7"]} />
              <Text size="s" tone="muted">
                {m.verify_title_checked()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {account.checked === false ? (
        <View
          style={{
            gap: space.xs,
            padding: space.s,
            borderRadius: radius.xs,
            borderCurve: "continuous",
            backgroundColor: colors["warning-transparent"],
          }}
        >
          <Text size="s" weight="medium">
            {m.verify_not_checked()}
          </Text>
          <Text size="s">{m.native_verify_why()}</Text>
          <Button
            variant="secondary"
            loading={isSendingCheck}
            onPress={onSendCheck}
            style={{ alignSelf: "flex-start" }}
          >
            {m.verify_send_again()}
          </Button>
        </View>
      ) : null}
    </Surface>
  );
}
