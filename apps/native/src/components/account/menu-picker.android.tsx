import { DropdownMenu, DropdownMenuItem, Host, Text, TextButton } from "@expo/ui/jetpack-compose";
import { semantics } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";

import { feel } from "@/components/ui/haptics";
import { useTheme } from "@/lib/theme";

import type { MenuOption } from "./menu-picker";

// One choice among a few, drawn by the platform at the end of a row: on Android Material's
// dropdown menu, opened from a text button that shows the value in the accent's color. iOS's is
// in `menu-picker.tsx`. Decision 069.

export type { MenuOption } from "./menu-picker";

export function MenuPicker<Value extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly MenuOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((one) => one.value === value)?.label ?? String(value);
  return (
    <Host matchContents colorScheme={scheme} seedColor={colors["color-1"]}>
      <DropdownMenu
        expanded={open}
        onDismissRequest={() => setOpen(false)}
        color={colors["neutral-1"]}
      >
        <DropdownMenu.Trigger>
          <TextButton
            onClick={() => setOpen(true)}
            modifiers={[semantics({ contentDescription: `${label}, ${current}` })]}
          >
            <Text color={colors["color-1"]}>{current}</Text>
          </TextButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {options.map((option) => (
            <DropdownMenuItem
              key={String(option.value)}
              onClick={() => {
                setOpen(false);
                if (option.value === value) return;
                feel("select");
                onChange(option.value);
              }}
            >
              <DropdownMenuItem.Text>
                <Text
                  color={colors["neutral-10"]}
                  style={{ fontWeight: option.value === value ? "bold" : "normal" }}
                >
                  {option.label}
                </Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}
