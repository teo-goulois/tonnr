import { type UsernameProblem, usernameProblem } from "@repo/config/username";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { fonts } from "@/theme/tokens";

// A username chosen before what is read under it: a report shows under its author's. The sign-in
// library keeps it, in small letters, and says when another account has it; the rules of
// packages/config are checked first, as the web's `UsernameForm` checks them. Decision 041.

const FAULTS: Record<UsernameProblem, () => string> = {
  short: m.username_too_short,
  long: m.username_too_long,
  characters: m.username_characters,
  reserved: m.username_reserved,
};

/** What a refusal of the sign-in library says of a username, in the reader's language. */
function refusalOf(code: string | undefined) {
  if (code === "USERNAME_IS_ALREADY_TAKEN") return m.username_taken();
  if (code === "USERNAME_TOO_SHORT") return m.username_too_short();
  if (code === "USERNAME_TOO_LONG") return m.username_too_long();
  if (code === "INVALID_USERNAME") return m.username_reserved();
  return m.username_failed();
}

/** Asks for a username, saying why, and goes on once it is kept. */
export function UsernameStep({ why, onSaved }: { why: string; onSaved: () => void }) {
  const { colors, space, type } = useTheme();
  const [typed, setTyped] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const username = typed.trim().toLowerCase();
  const problem = username ? usernameProblem(username) : null;
  const fault = problem ? FAULTS[problem]() : refused;

  async function save() {
    if (!username || problem || isSaving) return;
    setIsSaving(true);
    setRefused(null);
    const answer = await authClient.updateUser({ username }).catch(() => null);
    setIsSaving(false);
    if (!answer || answer.error) {
      setRefused(refusalOf(answer?.error?.code));
      return;
    }
    onSaved();
  }

  return (
    <View style={{ gap: space.s }}>
      <Text tone="muted">{why}</Text>
      <Surface
        insetEdge
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m }}
      >
        <Text tone="muted">@</Text>
        <TextInput
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setRefused(null);
          }}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          accessibilityLabel={m.username_choose()}
          accessibilityHint={m.username_hint()}
          placeholder={m.username_choose()}
          placeholderTextColor={colors["neutral-6"]}
          style={{
            flex: 1,
            minHeight: 48,
            color: colors["neutral-10"],
            fontFamily: fonts.regular,
            fontSize: type.m.size,
          }}
        />
      </Surface>
      <Text
        size="s"
        tone={fault ? "danger" : "muted"}
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: space.m }}
      >
        {fault ?? m.username_hint()}
      </Text>
      <Button
        onPress={() => void save()}
        disabled={!username || problem !== null}
        loading={isSaving}
        fill
      >
        {m.username_save()}
      </Button>
    </View>
  );
}
