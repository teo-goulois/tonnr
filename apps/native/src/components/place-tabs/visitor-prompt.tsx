import { type Href, router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/**
 * What a visitor reads in a tab of a place that needs an account, as the web's `AccountPrompt`
 * draws it in a place's panel: what an account would give there, then making one and signing in,
 * side by side from the start of the line, with no icon and no card. Both open the sheet that
 * signs in, on a new account for the first, which says the same words as its reason and goes on
 * to `next` once done, or back to the place (decisions 039 and 070).
 */
export function VisitorPrompt({ text, next }: { text: string; next?: Href }) {
  const { space } = useTheme();
  const params = (mode?: "sign-up") => ({
    reason: text,
    ...(typeof next === "string" && { next }),
    ...(mode && { mode }),
  });
  return (
    <View style={{ gap: space.m, alignItems: "flex-start" }}>
      <Text tone="muted">{text}</Text>
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
    </View>
  );
}
