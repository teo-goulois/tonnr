import { BookmarkIcon } from "@repo/ui/icon";
import { type Href, router } from "expo-router";
import { View } from "react-native";

import { Glyph } from "@/components/shared/glyph";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * What a visitor sees where an account's things would be, as the web's `AccountPrompt`: what an
 * account would give, then making one and signing in, which go on to `next` once done
 * (decisions 039 and 070). The sign-in screen reads `mode=sign-up` to open on the new account.
 */
export function AccountPrompt({ text, next }: { text: string; next?: Href }) {
  const { colors, space } = useTheme();
  const params = (mode?: "sign-up") => ({
    reason: text,
    ...(typeof next === "string" && { next }),
    ...(mode && { mode }),
  });
  return (
    <Surface style={{ padding: space.m, gap: space.m }}>
      <View style={{ flexDirection: "row", gap: space.s, alignItems: "flex-start" }}>
        <Glyph icon={BookmarkIcon} size={20} color={colors["neutral-7"]} />
        <Text tone="muted" style={{ flex: 1 }}>
          {text}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button onPress={() => router.push({ pathname: "/sign-in", params: params("sign-up") })}>
          {m.auth_create_account()}
        </Button>
        <Button
          variant="secondary"
          onPress={() => router.push({ pathname: "/sign-in", params: params() })}
        >
          {m.auth_sign_in()}
        </Button>
      </View>
    </Surface>
  );
}
