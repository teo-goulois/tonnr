import { type Href, router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * What a visitor sees where an account's things would be, the web's `AccountPrompt`: what an
 * account would give, in the screen's own words, then making one and signing in, at their own
 * width, which go on to `next` once done (decisions 039 and 070). The sign-in sheet reads
 * `mode=sign-up` to open on the new account, and is given no reason: the sentence was read here.
 */
export function AccountPrompt({ text, next }: { text: string; next?: Href }) {
  const { space } = useTheme();
  const params = (mode?: "sign-up") => ({
    ...(typeof next === "string" && { next }),
    ...(mode && { mode }),
  });
  return (
    <View style={{ gap: space.m }}>
      <Text tone="muted">{text}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button onPress={() => router.push({ pathname: "/sign-in", params: params("sign-up") })}>
          {m.auth_create_account()}
        </Button>
        <Button
          variant="outline"
          onPress={() => router.push({ pathname: "/sign-in", params: params() })}
        >
          {m.auth_sign_in()}
        </Button>
      </View>
    </View>
  );
}
