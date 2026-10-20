import { PlusIcon } from "@repo/ui/icon";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { feel } from "@/components/ui/haptics";
import { RowTile } from "@/components/ui/list";
import { Surface } from "@/components/ui/surface";
import { useTheme } from "@/lib/theme";
import { m } from "@/paraglide/messages";

import { TextField } from "./text-field";

/** As long as a list's name may be: the API takes sixty characters. */
export const NAME_MOST = 60;

/**
 * A new list, named where it is made: the last row of the saved tab. The keyboard's own key
 * makes it, as the button beside it does once a name is typed.
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
  const trimmed = name.trim();

  const create = () => {
    if (!trimmed || creating) return;
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
    <Surface
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.s,
        paddingLeft: space.m,
        paddingRight: space.xs,
        paddingVertical: space.xxs,
      }}
    >
      <RowTile icon={PlusIcon} />
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={m.saved_new_list()}
        accessibilityLabel={m.saved_new_list()}
        maxLength={NAME_MOST}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={create}
        autoCapitalize="sentences"
        editable={!creating}
      />
      {trimmed ? (
        <Button variant="secondary" onPress={create} loading={creating}>
          {m.saved_create_list()}
        </Button>
      ) : null}
    </Surface>
  );
}
