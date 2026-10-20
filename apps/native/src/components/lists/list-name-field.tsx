import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Section } from "@/components/ui/list";
import { m } from "@/paraglide/messages";
import { useTheme } from "@/lib/theme";

import { NAME_MOST } from "./new-list-field";
import { TextField } from "./text-field";

/**
 * A list's name, changed where it is read, in a grouped row of the list's screen: the button
 * that saves it comes once the name is another, and the keyboard's own key saves it too. The
 * favorites keep their label, which the API refuses to change. Keyed by the name, it starts
 * again from the one the list has, once it was saved here or elsewhere.
 */
export function ListNameField({
  name,
  saving,
  onRename,
}: {
  name: string;
  saving: boolean;
  onRename: (name: string) => Promise<unknown>;
}) {
  const { space } = useTheme();
  const [typed, setTyped] = useState(name);
  const trimmed = typed.trim();
  const changed = trimmed !== "" && trimmed !== name;

  const save = () => {
    if (!changed || saving) return;
    void onRename(trimmed).then(
      () => feel("done"),
      // What failed was told: what was typed stays, to be sent again.
      () => {},
    );
  };

  return (
    <Section title={m.saved_list_name()}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.s,
          paddingLeft: space.m,
          paddingRight: space.xs,
          paddingVertical: space.xxs,
        }}
      >
        <TextField
          value={typed}
          onChangeText={setTyped}
          accessibilityLabel={m.saved_list_name()}
          maxLength={NAME_MOST}
          autoCapitalize="sentences"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={save}
          editable={!saving}
        />
        {changed ? (
          <Button variant="secondary" onPress={save} loading={saving}>
            {m.native_save()}
          </Button>
        ) : null}
      </View>
    </Section>
  );
}
