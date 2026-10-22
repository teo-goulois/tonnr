import type { Rank } from "@repo/client/viewer/types";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTell } from "@/components/ui/toast";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { RankBadge } from "./rank-badge";
import { UsernameForm } from "./username-form";

type AccountHeaderProps = {
  // What the account is called by: `@username` once it has one, else its name.
  title: string;
  email: string;
  rank: Rank | null | undefined;
  // What the API says of the username: null for an account that has chosen none yet, and
  // undefined while the API has not said, when nothing is offered to choose one.
  username: string | null | undefined;
  // Given when the account's address is not checked yet, on an instance that checks addresses.
  check?: { isSending: boolean; onSend: () => void } | undefined;
};

/**
 * Who is signed in, at the top of the account's tab, as the web's `AccountPanel` writes it: the
 * name others read and the rank reached, the address under it, then what chooses a username, which
 * unfolds its form in place, and while the address is not checked the mail that checks it again.
 * Decisions 026, 040 and 041.
 */
export function AccountHeader({ title, email, rank, username, check }: AccountHeaderProps) {
  const { space } = useTheme();
  const tell = useTell();
  const [isNaming, setNaming] = useState(false);

  return (
    <View style={{ alignItems: "flex-start", gap: space.xxs }}>
      {/* An account is called by its username once it has one, with the rank it reached. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, maxWidth: "100%" }}>
        <Text weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {rank ? <RankBadge rank={rank} /> : null}
      </View>
      <Text size="s" tone="muted" numberOfLines={1} style={{ maxWidth: "100%" }}>
        {email}
      </Text>
      {username === undefined ? null : isNaming ? (
        <View style={{ alignSelf: "stretch", marginTop: space.xs }}>
          <UsernameForm
            current={username}
            onSaved={(chosen) => {
              setNaming(false);
              tell({ title: m.username_saved({ username: chosen }), tone: "success" });
            }}
            onCancel={() => setNaming(false)}
          />
        </View>
      ) : (
        <View style={{ alignItems: "flex-start", gap: space.xs, marginTop: space.xs }}>
          {username === null ? <Text size="s">{m.username_none()}</Text> : null}
          <Button variant="secondary" onPress={() => setNaming(true)}>
            {username === null ? m.username_choose() : m.username_change()}
          </Button>
        </View>
      )}
      {check ? (
        <View style={{ alignItems: "flex-start", gap: space.xs, marginTop: space.xs }}>
          <Text size="s">{m.verify_not_checked()}</Text>
          <Button variant="secondary" loading={check.isSending} onPress={check.onSend}>
            {m.verify_send_again()}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
