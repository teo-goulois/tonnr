import { PlusIcon } from "@repo/ui/icon";
import { useState } from "react";
import { View } from "react-native";

import { IconButton } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { Field, Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

/** As long as a list's name may be: the API takes sixty characters. */
export const NAME_MOST = 60;

/**
 * A new list, named where it is made, as the web's `NewListForm`: the last part of the saved tab,
 * a field and the round button that makes the list, which the keyboard's own key does too. A name
 * left empty is said under the field, and the button is never held still for it (decision 076).
 * What was typed goes once the list is made, and stays when it could not be.
 */
export function NewListField({
  onCreate,
  creating,
}: {
  onCreate: (name: string) => Promise<unknown>;
  creating: boolean;
}) {
  const { space } = useTheme();
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);

  const create = () => {
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      feel("failed");
      setMissing(true);
      return;
    }
    void onCreate(trimmed).then(
      () => {
        feel("done");
        setName("");
      },
      // What failed was told: what was typed stays, to be sent again.
      () => {},
    );
  };

  return (
    <Field error={missing ? m.saved_list_name_missing() : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Input
          value={name}
          onChangeText={(typed) => {
            setName(typed);
            setMissing(false);
          }}
          placeholder={m.saved_new_list()}
          accessibilityLabel={m.saved_new_list()}
          invalid={missing}
          maxLength={NAME_MOST}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={create}
          autoCapitalize="sentences"
          editable={!creating}
        />
        <IconButton
          icon={PlusIcon}
          label={m.saved_create_list()}
          variant="secondary"
          onPress={create}
          loading={creating}
        />
      </View>
    </Field>
  );
}
