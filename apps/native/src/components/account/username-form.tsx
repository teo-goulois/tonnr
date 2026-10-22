import { USERNAME_MAX } from "@repo/config/username";
import { useState } from "react";
import { View } from "react-native";

import { Field } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { typedUsername, usernameFault, usernameSays } from "./username";
import { useSaveUsername, useUsernameFree } from "./use-username";

/**
 * Chooses the name others read of an account, its first or another, as the web's `UsernameForm`
 * does: it says whether the name is free before it is sent, and why not once it was. Its Save
 * stands at its own width and waits only for a name other than the account's own: a name that
 * is no username is refused under the field once it is sent (decision 076). Decision 041.
 */
export function UsernameForm({
  current,
  onSaved,
  onCancel,
  autoFocus = false,
}: {
  // The account's username. Null for an account that has none yet.
  current: string | null;
  onSaved: (username: string) => void;
  // Left out where the form cannot be left, as on the way to a first contribution, or where the
  // stack's own back leaves it.
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { space } = useTheme();
  const save = useSaveUsername();
  const [typed, setTyped] = useState(current ?? "");
  const [refusal, setRefusal] = useState<{ of: string; why: string }>();
  const [saving, setSaving] = useState(false);
  const [wasSent, setWasSent] = useState(false);

  const username = typedUsername(typed);
  const isFree = useUsernameFree(username, current);
  const says = usernameSays({ username, isFree, wasSent, refusal });

  async function send() {
    setWasSent(true);
    if (saving || usernameFault(username) || username === current) return;
    setSaving(true);
    const why = await save(username);
    setSaving(false);
    if (why) {
      feel("failed");
      setRefusal({ of: username, why });
      return;
    }
    feel("done");
    onSaved(username);
  }

  return (
    <View style={{ gap: space.s }}>
      <Field
        label={m.auth_username()}
        value={typed}
        onChangeText={(text) => setTyped(text.toLowerCase())}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType="nickname"
        autoComplete="off"
        maxLength={USERNAME_MAX}
        returnKeyType="done"
        onSubmitEditing={() => void send()}
        disabled={saving}
        error={says.error}
        hint={says.hint}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {/* The account's own name is not sent again: there is nothing to save. */}
        <Button loading={saving} disabled={username === current} onPress={() => void send()}>
          {m.username_save()}
        </Button>
        {onCancel ? (
          <Button variant="ghost" disabled={saving} onPress={onCancel}>
            {m.action_cancel()}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
